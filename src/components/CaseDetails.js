import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink } from '../utils/caseAccess';
import {
  CloseIcon,
  DraftingIcon,
  EyeIcon,
  LockIcon,
  MessageIcon,
  PaymentsIcon,
  PlusIcon,
  UnlockIcon,
  WhatsAppIcon,
} from './AppIcons';
import LoadingState from './LoadingState';
import { syncCaseAccessComment, syncCaseAccessPayment, syncCaseAccessRecord } from '../utils/clientAccessRecords';
import { createLifecycleStep, formatLifecycleDate, isHearingLifecycleStep, sortLifecycleForCase } from '../utils/lifecycle';

const lifecyclePresets = [
  'Initial consultation',
  'Document review',
  'Draft petition and evidence set',
  'Legal notice',
  'File before court',
  'Interim relief hearing',
  'Main hearing',
  'Arguments',
  'Order follow-up and closure',
];

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);

const emptyPaymentForm = {
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  stage: '',
  requestedFromClient: true,
};

const buildShareMessage = (caseRecord) =>
  `iAdvocate has shared your case updates for ${caseRecord.case_number}. Open your case link here: ${buildCaseAccessLink(
    caseRecord.client_access_token
  )}`;

const buildWhatsAppShareLink = (caseRecord) =>
  `https://wa.me/?text=${encodeURIComponent(buildShareMessage(caseRecord))}`;

const buildSmsShareLink = (caseRecord) =>
  `sms:?&body=${encodeURIComponent(buildShareMessage(caseRecord))}`;

const CaseDetails = () => {
  const { t } = useTranslation();
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [caseRecord, setCaseRecord] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [selectedLifecyclePreset, setSelectedLifecyclePreset] = useState(lifecyclePresets[0]);
  const [selectedLifecycleEta, setSelectedLifecycleEta] = useState('');
  const [selectedLifecycleType, setSelectedLifecycleType] = useState('general');
  const [selectedLifecycleDate, setSelectedLifecycleDate] = useState('');
  const [selectedLifecycleNotes, setSelectedLifecycleNotes] = useState('');
  const [activePanel, setActivePanel] = useState('');
  const [expandedLifecycleStep, setExpandedLifecycleStep] = useState('');
  const [comments, setComments] = useState([]);
  const [clientDocuments, setClientDocuments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCase = useCallback(async () => {
    if (!caseId) {
      setLoading(false);
      return;
    }
    try {
      const caseSnap = await getDoc(doc(db, 'cases', caseId));
      if (!caseSnap.exists()) {
        setCaseRecord(null);
        setPayments([]);
        return;
      }

      const nextCase = { id: caseSnap.id, ...caseSnap.data() };
      const [paymentSnap, commentSnap, documentsSnap] = nextCase.client_access_token
        ? await Promise.all([
            getDocs(collection(db, 'client_access', nextCase.client_access_token, 'payments')),
            getDocs(collection(db, 'client_access', nextCase.client_access_token, 'comments')),
            getDocs(collection(db, 'client_access', nextCase.client_access_token, 'documents')),
          ])
        : await Promise.all([
            getDocs(
              query(
                collection(db, 'payments'),
                where('advocate_id', '==', auth.currentUser?.uid || ''),
                where('case_id', '==', nextCase.case_number)
              )
            ),
            getDocs(
              query(
                collection(db, 'comments'),
                where('advocate_id', '==', auth.currentUser?.uid || ''),
                where('case_id', '==', nextCase.case_number)
              )
            ),
            getDocs(
              query(
                collection(db, 'documents'),
                where('advocate_id', '==', auth.currentUser?.uid || ''),
                where('case_id', '==', nextCase.case_number)
              )
            ),
          ]);

      setCaseRecord(nextCase);
      setPayments(paymentSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setComments(
        commentSnap.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
          .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
      );
      setClientDocuments(
        documentsSnap.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
          .filter((item) => item.uploaded_by_role === 'client')
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const progressLabel = useMemo(() => {
    const lifecycle = caseRecord?.lifecycle || [];
    const completed = lifecycle.filter((step) => step.status === 'done').length;
    return `${completed}/${lifecycle.length || 1} milestones complete`;
  }, [caseRecord]);

  const updateLifecycleStatus = async (stepId, nextStatus) => {
    if (!caseRecord) return;
    const lifecycle = (caseRecord.lifecycle || []).map((step) =>
      step.id === stepId ? { ...step, status: nextStatus } : step
    );
    const sortedLifecycle = sortLifecycleForCase(lifecycle);
    await updateDoc(doc(db, 'cases', caseRecord.id), { lifecycle: sortedLifecycle });
    await syncCaseAccessRecord({ ...caseRecord, lifecycle: sortedLifecycle });
    await loadCase();
  };

  const updateLifecycleField = async (stepId, key, value) => {
    if (!caseRecord) return;
    const lifecycle = (caseRecord.lifecycle || []).map((step) =>
      step.id === stepId ? { ...step, [key]: value } : step
    );
    await updateDoc(doc(db, 'cases', caseRecord.id), { lifecycle });
    await syncCaseAccessRecord({ ...caseRecord, lifecycle });
    await loadCase();
  };

  const addLifecycleStep = async () => {
    if (!caseRecord) return;
    const currentLifecycle = caseRecord.lifecycle || [];
    const firstPendingIndex = currentLifecycle.findIndex((step) => step.status === 'pending');
    const insertAt = firstPendingIndex === -1 ? currentLifecycle.length : firstPendingIndex;
    const nextStep = createLifecycleStep({
      id: `step-${Date.now()}`,
      title: selectedLifecyclePreset,
      eta: selectedLifecycleEta,
      scheduledDate: selectedLifecycleDate,
      stageType: selectedLifecycleType,
      notes: selectedLifecycleNotes,
      status: 'pending',
    });
    const lifecycle = [
      ...currentLifecycle.slice(0, insertAt),
      nextStep,
      ...currentLifecycle.slice(insertAt),
    ];
    await updateDoc(doc(db, 'cases', caseRecord.id), { lifecycle });
    await syncCaseAccessRecord({ ...caseRecord, lifecycle });
    setSelectedLifecycleEta('');
    setSelectedLifecycleDate('');
    setSelectedLifecycleNotes('');
    setExpandedLifecycleStep(nextStep.id);
    setActivePanel('');
    await loadCase();
  };

  const toggleClientAccess = async () => {
    if (!caseRecord) return;
    await updateDoc(doc(db, 'cases', caseRecord.id), {
      client_access_enabled: !caseRecord.client_access_enabled,
    });
    await syncCaseAccessRecord({
      ...caseRecord,
      client_access_enabled: !caseRecord.client_access_enabled,
    });
    await loadCase();
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!caseRecord) return;

    const paymentPayload = {
      advocate_id: auth.currentUser?.uid,
      case_id: caseRecord.case_number,
      amount: parseFloat(paymentForm.amount),
      date: paymentForm.date,
      description: paymentForm.description,
      stage: paymentForm.stage || 'Case fee',
      status: paymentForm.requestedFromClient ? 'Requested' : 'Paid',
      requested_from_client: paymentForm.requestedFromClient,
      client_access_token: caseRecord.client_access_token,
    };

    const paymentRef = await addDoc(collection(db, 'payments'), paymentPayload);
    await syncCaseAccessPayment(caseRecord.client_access_token, paymentPayload, paymentRef.id);

    setPaymentForm(emptyPaymentForm);
    setActivePanel('');
    await loadCase();
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!caseRecord || !commentDraft.trim()) return;

    const payload = {
      advocate_id: auth.currentUser?.uid,
      case_id: caseRecord.case_number,
      author_role: 'advocate',
      author_name: auth.currentUser?.displayName || 'Advocate',
      message: commentDraft.trim(),
      created_at: new Date().toISOString(),
      client_access_token: caseRecord.client_access_token,
    };

    const commentRef = await addDoc(collection(db, 'comments'), payload);
    await syncCaseAccessComment(caseRecord.client_access_token, payload, commentRef.id);
    setCommentDraft('');
    setActivePanel('');
    await loadCase();
  };

  const toggleLifecycleStep = (stepId) => {
    setExpandedLifecycleStep((current) => {
      const next = current === stepId ? '' : stepId;
      if (next) {
        setActivePanel('');
      }
      return next;
    });
  };

  const togglePanel = (panelKey) => {
    setActivePanel((current) => {
      const next = current === panelKey ? '' : panelKey;
      if (next) {
        setExpandedLifecycleStep('');
      }
      return next;
    });
  };

  if (loading) {
    return (
      <PageShell title={t('caseDetails')} subtitle={t('loadingMatterDetails')} showBack>
        <LoadingState label={t('loadingMatterDetails')} />
      </PageShell>
    );
  }

  if (!caseRecord) {
    return (
      <PageShell title={t('caseDetails')} subtitle={t('loadingMatterDetails')} showBack>
        <section className="panel">
          <p className="empty-state">{t('caseNotFound')}</p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={caseRecord.case_number}
      subtitle={t('caseDetailsSubtitle')}
      showBack
      actions={
        <div className="header-icon-group">
          <a
            className="icon-button icon-button--whatsapp"
            href={buildWhatsAppShareLink(caseRecord)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('shareOnWhatsApp')}
            title={t('shareOnWhatsApp')}
          >
            <WhatsAppIcon className="app-icon" />
          </a>
          <a
            className="icon-button"
            href={buildSmsShareLink(caseRecord)}
            aria-label={t('shareBySms')}
            title={t('shareBySms')}
          >
            <MessageIcon className="app-icon" />
          </a>
          <a
            className="icon-button"
            href={buildCaseAccessLink(caseRecord.client_access_token)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('previewClientCaseView')}
            title={t('previewClientCaseView')}
          >
            <EyeIcon className="app-icon" />
          </a>
          <button
            type="button"
            className="icon-button"
            aria-label={t('openDraftingAssistant')}
            title={t('openDraftingAssistant')}
            onClick={() => navigate(`/drafting?caseId=${caseRecord.id}`)}
          >
            <DraftingIcon className="app-icon" />
          </button>
          <button
            type="button"
            className={`icon-button${caseRecord.client_access_enabled ? '' : ' icon-button--danger'}`}
            aria-label={caseRecord.client_access_enabled ? t('pauseClientAccess') : t('enableClientAccess')}
            title={caseRecord.client_access_enabled ? t('pauseClientAccess') : t('enableClientAccess')}
            onClick={toggleClientAccess}
          >
            {caseRecord.client_access_enabled ? <UnlockIcon className="app-icon" /> : <LockIcon className="app-icon" />}
          </button>
        </div>
      }
    >
      <section className="hero-card case-hero">
        <div>
          <p className="eyebrow">{t('clientLabel')}</p>
          <h2>{caseRecord.client_name}</h2>
          <p>{caseRecord.client_phone || caseRecord.client_email || t('clientContactMissing')}</p>
        </div>
        <div className="case-hero__meta">
          <span className="badge">{caseRecord.status}</span>
          <span className="case-hero__progress">{progressLabel}</span>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('matterBrief')}</p>
            <h2>{t('caseDetails')}</h2>
          </div>
        </div>
        <div className="details-grid">
          <article className="record-item">
            <div>
              <strong>{t('summaryLabel')}</strong>
              <p>{caseRecord.summary || t('noSummaryAdded')}</p>
            </div>
          </article>
          <article className="record-item">
            <div>
              <strong>{t('nextStepShort')}</strong>
              <p>{caseRecord.next_step || t('noNextStepYet')}</p>
            </div>
          </article>
          <article className="record-item">
            <div>
              <strong>{t('clientLinkLabel')}</strong>
              <p>{caseRecord.client_access_enabled ? t('clientLinkActive') : t('clientLinkDisabled')}</p>
            </div>
            <a
              className="icon-button"
              href={buildCaseAccessLink(caseRecord.client_access_token)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('previewClientCaseView')}
              title={t('previewClientCaseView')}
            >
              <EyeIcon className="app-icon" />
            </a>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('lifecycle')}</p>
            <h2>{t('progressControl')}</h2>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            aria-label={activePanel === 'lifecycle-add' ? t('closeAddStageForm') : t('addLifecycleStep')}
            title={activePanel === 'lifecycle-add' ? t('closeAddStageForm') : t('addLifecycleStep')}
            onClick={() => togglePanel('lifecycle-add')}
          >
            {activePanel === 'lifecycle-add' ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
          </button>
        </div>
        {activePanel === 'lifecycle-add' ? (
        <>
        <div className="planning-row">
          <select value={selectedLifecyclePreset} onChange={(e) => setSelectedLifecyclePreset(e.target.value)}>
            {lifecyclePresets.map((preset) => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
          <select value={selectedLifecycleType} onChange={(e) => setSelectedLifecycleType(e.target.value)}>
            <option value="general">{t('generalStage')}</option>
            <option value="hearing">{t('hearingStage')}</option>
          </select>
          <input
            type="month"
            value={selectedLifecycleEta}
            onChange={(e) => setSelectedLifecycleEta(e.target.value)}
          />
          <input
            type="date"
            value={selectedLifecycleDate}
            onChange={(e) => setSelectedLifecycleDate(e.target.value)}
          />
        </div>
        <div className="form-group top-space">
          <label>{t('stageNotes')}</label>
          <textarea
            value={selectedLifecycleNotes}
            onChange={(e) => setSelectedLifecycleNotes(e.target.value)}
            placeholder={t('stageNotesPlaceholder')}
          />
        </div>
        <button type="button" className="button" onClick={addLifecycleStep}>
          {t('addLifecycleStep')}
        </button>
        </>
        ) : (
          <p className="empty-state">{t('lifecycleFormHint')}</p>
        )}
        <div className="lifecycle-editor">
          {(caseRecord.lifecycle || []).map((step, index) => (
            <div key={step.id} className="lifecycle-row lifecycle-row--card">
              <button
                type="button"
                className="record-item lifecycle-row__summary"
                onClick={() => toggleLifecycleStep(step.id)}
              >
                <div>
                  <strong>{t('stepNumber', { count: index + 1 })}</strong>
                  <p>{step.title}</p>
                  {isHearingLifecycleStep(step) && step.scheduled_date ? (
                    <p className="case-status-text">{t('hearingOn')} {formatLifecycleDate(step.scheduled_date)}</p>
                  ) : null}
                </div>
                <div className="record-item__action">
                  <span className="badge">{step.status}</span>
                  {expandedLifecycleStep === step.id ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
                </div>
              </button>
              {expandedLifecycleStep === step.id ? (
              <div className="planning-stack">
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateLifecycleField(step.id, 'title', e.target.value)}
                  placeholder={t('stepTitle')}
                />
                <select
                  value={step.stage_type || 'general'}
                  onChange={(e) => updateLifecycleField(step.id, 'stage_type', e.target.value)}
                >
                  <option value="general">{t('generalStage')}</option>
                  <option value="hearing">{t('hearingStage')}</option>
                </select>
                <input
                  type="month"
                  value={step.eta || ''}
                  onChange={(e) => updateLifecycleField(step.id, 'eta', e.target.value)}
                />
                <input
                  type="date"
                  value={step.scheduled_date || ''}
                  onChange={(e) => updateLifecycleField(step.id, 'scheduled_date', e.target.value)}
                />
                <textarea
                  value={step.notes || ''}
                  onChange={(e) => updateLifecycleField(step.id, 'notes', e.target.value)}
                  placeholder={t('stageNotesPlaceholder')}
                />
                <select value={step.status} onChange={(e) => updateLifecycleStatus(step.id, e.target.value)}>
                  <option value="pending">{t('tentative')}</option>
                  <option value="in_progress">{t('inProgress')}</option>
                  <option value="done">{t('done')}</option>
                </select>
              </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('payments')}</p>
            <h2>{t('requestOrRecordFees')}</h2>
          </div>
          <div className="header-icon-group">
            <PaymentsIcon className="app-icon section-icon" />
            <button
              type="button"
              className="icon-button icon-button--accent"
              aria-label={activePanel === 'payments' ? t('closePaymentForm') : t('openPaymentForm')}
              title={activePanel === 'payments' ? t('closePaymentForm') : t('openPaymentForm')}
              onClick={() => togglePanel('payments')}
            >
              {activePanel === 'payments' ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
            </button>
          </div>
        </div>
        {activePanel === 'payments' ? (
        <form onSubmit={handlePaymentSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('amount')}:</label>
              <input
                type="number"
                placeholder={t('amountInInr')}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((current) => ({ ...current, amount: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('date')}:</label>
              <input
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm((current) => ({ ...current, date: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('stage')}:</label>
              <input
                type="text"
                placeholder="Filing, hearing, drafting, etc."
                value={paymentForm.stage}
                onChange={(e) => setPaymentForm((current) => ({ ...current, stage: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>{t('paymentMode')}:</label>
              <select
                value={paymentForm.requestedFromClient ? 'request' : 'recorded'}
                onChange={(e) =>
                  setPaymentForm((current) => ({
                    ...current,
                    requestedFromClient: e.target.value === 'request',
                  }))
                }
              >
                <option value="request">{t('requestFromClient')}</option>
                <option value="recorded">{t('recordReceived')}</option>
              </select>
            </div>
            <div className="form-group full-span">
              <label>{t('description')}:</label>
              <input
                type="text"
                placeholder={t('paymentPurpose')}
                value={paymentForm.description}
                onChange={(e) => setPaymentForm((current) => ({ ...current, description: e.target.value }))}
                required
              />
            </div>
          </div>
          <button type="submit" className="button">
            {paymentForm.requestedFromClient ? t('requestPayment') : t('savePayment')}
          </button>
        </form>
        ) : (
          <p className="empty-state">{t('feeFormHint')}</p>
        )}
        <div className="record-list top-space">
          {payments.map((payment) => (
            <article key={payment.id} className="record-item">
              <div>
                <strong>{payment.description || payment.stage || t('caseFee')}</strong>
                <p>{payment.stage || t('caseFee')} | {payment.date}</p>
              </div>
              <span className="badge">{formatCurrency(payment.amount)} | {payment.status || 'Paid'}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('comments')}</p>
            <h2>{t('caseNotes')}</h2>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            aria-label={activePanel === 'notes' ? t('closeCaseNotesForm') : t('openCaseNotesForm')}
            title={activePanel === 'notes' ? t('closeCaseNotesForm') : t('openCaseNotesForm')}
            onClick={() => togglePanel('notes')}
          >
            {activePanel === 'notes' ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
          </button>
        </div>
        {comments.length === 0 ? (
          <p className="empty-state">{t('caseNotesEmpty')}</p>
        ) : (
          <div className="record-list">
            {comments.map((commentItem) => (
              <article key={commentItem.id} className="record-item record-item--stack">
                <div>
                  <strong>{commentItem.author_name || commentItem.author_role}</strong>
                  <p>{commentItem.message}</p>
                </div>
                <span className="badge">{commentItem.author_role}</span>
              </article>
            ))}
          </div>
        )}
        {activePanel === 'notes' ? (
          <form onSubmit={handleCommentSubmit} className="top-space">
            <div className="form-group">
              <label>{t('addCaseNote')}</label>
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={t('addCaseNotePlaceholder')}
                required
              />
            </div>
            <button type="submit" className="button">{t('saveCaseNote')}</button>
          </form>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('documents')}</p>
            <h2>{t('clientSharedDocuments')}</h2>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            aria-label={activePanel === 'client-documents' ? t('collapseClientDocuments') : t('expandClientDocuments')}
            title={activePanel === 'client-documents' ? t('collapseClientDocuments') : t('expandClientDocuments')}
            onClick={() => togglePanel('client-documents')}
          >
            {activePanel === 'client-documents' ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
          </button>
        </div>
        {activePanel === 'client-documents' ? (
          clientDocuments.length === 0 ? (
            <p className="empty-state">{t('clientDocumentsEmpty')}</p>
          ) : (
            <div className="record-list">
              {clientDocuments.map((documentItem) => (
                <article key={documentItem.id} className="record-item">
                  <div>
                    <strong>{documentItem.name}</strong>
                    <p>{documentItem.type || t('generalFile')}</p>
                  </div>
                  <a className="inline-link" href={documentItem.url} target="_blank" rel="noopener noreferrer">
                    {t('open')}
                  </a>
                </article>
              ))}
            </div>
          )
        ) : (
          <p className="empty-state">{t('clientDocumentsHint')}</p>
        )}
      </section>
    </PageShell>
  );
};

export default CaseDetails;
