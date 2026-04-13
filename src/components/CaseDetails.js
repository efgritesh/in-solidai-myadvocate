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
import { syncCaseAccessPayment, syncCaseAccessRecord } from '../utils/clientAccessRecords';

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
  const [showPaymentForm, setShowPaymentForm] = useState(false);
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
      const paymentSnap = nextCase.client_access_token
        ? await getDocs(collection(db, 'client_access', nextCase.client_access_token, 'payments'))
        : await getDocs(
            query(
              collection(db, 'payments'),
              where('advocate_id', '==', auth.currentUser?.uid || ''),
              where('case_id', '==', nextCase.case_number)
            )
          );

      setCaseRecord(nextCase);
      setPayments(paymentSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
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
    await updateDoc(doc(db, 'cases', caseRecord.id), { lifecycle });
    await syncCaseAccessRecord({ ...caseRecord, lifecycle });
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
    const nextStep = {
      id: `step-${Date.now()}`,
      title: selectedLifecyclePreset,
      eta: selectedLifecycleEta,
      status: 'pending',
    };
    const lifecycle = [
      ...currentLifecycle.slice(0, insertAt),
      nextStep,
      ...currentLifecycle.slice(insertAt),
    ];
    await updateDoc(doc(db, 'cases', caseRecord.id), { lifecycle });
    await syncCaseAccessRecord({ ...caseRecord, lifecycle });
    setSelectedLifecycleEta('');
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
    await loadCase();
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
            aria-label={t('addLifecycleStep')}
            title={t('addLifecycleStep')}
            onClick={addLifecycleStep}
          >
            <PlusIcon className="app-icon" />
          </button>
        </div>
        <div className="planning-row">
          <select value={selectedLifecyclePreset} onChange={(e) => setSelectedLifecyclePreset(e.target.value)}>
            {lifecyclePresets.map((preset) => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
          <input
            type="month"
            value={selectedLifecycleEta}
            onChange={(e) => setSelectedLifecycleEta(e.target.value)}
          />
        </div>
        <div className="lifecycle-editor">
          {(caseRecord.lifecycle || []).map((step, index) => (
            <div key={step.id} className="lifecycle-row lifecycle-row--card">
              <div className="planning-stack">
                <div>
                  <strong>{t('stepNumber', { count: index + 1 })}</strong>
                </div>
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateLifecycleField(step.id, 'title', e.target.value)}
                  placeholder={t('stepTitle')}
                />
                <input
                  type="month"
                  value={step.eta || ''}
                  onChange={(e) => updateLifecycleField(step.id, 'eta', e.target.value)}
                />
              </div>
              <select value={step.status} onChange={(e) => updateLifecycleStatus(step.id, e.target.value)}>
                <option value="pending">{t('tentative')}</option>
                <option value="in_progress">{t('inProgress')}</option>
                <option value="done">{t('done')}</option>
              </select>
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
              aria-label={showPaymentForm ? t('closePaymentForm') : t('openPaymentForm')}
              title={showPaymentForm ? t('closePaymentForm') : t('openPaymentForm')}
              onClick={() => setShowPaymentForm((current) => !current)}
            >
              {showPaymentForm ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
            </button>
          </div>
        </div>
        {showPaymentForm ? (
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
    </PageShell>
  );
};

export default CaseDetails;
