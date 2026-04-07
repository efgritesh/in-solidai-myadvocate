import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink } from '../utils/caseAccess';
import { CloseIcon, CopyIcon, LockIcon, PaymentsIcon, PlusIcon, ShareIcon, UnlockIcon } from './AppIcons';

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

const CaseDetails = () => {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [selectedLifecyclePreset, setSelectedLifecyclePreset] = useState(lifecyclePresets[0]);
  const [selectedLifecycleEta, setSelectedLifecycleEta] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const loadCase = useCallback(async () => {
    if (!caseId) return;
    const caseSnap = await getDoc(doc(db, 'cases', caseId));
    if (!caseSnap.exists()) {
      setCaseRecord(null);
      setPayments([]);
      return;
    }

    const nextCase = { id: caseSnap.id, ...caseSnap.data() };
    const paymentSnap = await getDocs(
      query(
        collection(db, 'payments'),
        where('advocate_id', '==', auth.currentUser?.uid || ''),
        where('case_id', '==', nextCase.case_number)
      )
    );

    setCaseRecord(nextCase);
    setPayments(paymentSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
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
    await loadCase();
  };

  const updateLifecycleField = async (stepId, key, value) => {
    if (!caseRecord) return;
    const lifecycle = (caseRecord.lifecycle || []).map((step) =>
      step.id === stepId ? { ...step, [key]: value } : step
    );
    await updateDoc(doc(db, 'cases', caseRecord.id), { lifecycle });
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
    setSelectedLifecycleEta('');
    await loadCase();
  };

  const toggleClientAccess = async () => {
    if (!caseRecord) return;
    await updateDoc(doc(db, 'cases', caseRecord.id), {
      client_access_enabled: !caseRecord.client_access_enabled,
    });
    await loadCase();
  };

  const copyCaseLink = async () => {
    if (!caseRecord?.client_access_token) return;
    await navigator.clipboard.writeText(buildCaseAccessLink(caseRecord.client_access_token));
    alert('Client case link copied.');
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!caseRecord) return;

    await addDoc(collection(db, 'payments'), {
      advocate_id: auth.currentUser?.uid,
      case_id: caseRecord.case_number,
      amount: parseFloat(paymentForm.amount),
      date: paymentForm.date,
      description: paymentForm.description,
      stage: paymentForm.stage || 'Case fee',
      status: paymentForm.requestedFromClient ? 'Requested' : 'Paid',
      requested_from_client: paymentForm.requestedFromClient,
      client_access_token: caseRecord.client_access_token,
    });

    setPaymentForm(emptyPaymentForm);
    await loadCase();
  };

  if (!caseRecord) {
    return (
      <PageShell title="Case details" subtitle="Loading matter details." showBack>
        <section className="panel">
          <p className="empty-state">This case could not be found.</p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={caseRecord.case_number}
      subtitle="Matter details, client access, lifecycle tracking, and case-linked payments in one place."
      showBack
      actions={
        <div className="header-icon-group">
          <button type="button" className="icon-button" aria-label="Copy case link" onClick={copyCaseLink}>
            <CopyIcon className="app-icon" title="Copy case link" />
          </button>
          <button
            type="button"
            className={`icon-button${caseRecord.client_access_enabled ? '' : ' icon-button--danger'}`}
            aria-label={caseRecord.client_access_enabled ? 'Pause client access' : 'Enable client access'}
            title={caseRecord.client_access_enabled ? 'Pause client access' : 'Enable client access'}
            onClick={toggleClientAccess}
          >
            {caseRecord.client_access_enabled ? <UnlockIcon className="app-icon" /> : <LockIcon className="app-icon" />}
          </button>
        </div>
      }
    >
      <section className="hero-card case-hero">
        <div>
          <p className="eyebrow">Client</p>
          <h2>{caseRecord.client_name}</h2>
          <p>{caseRecord.client_phone || caseRecord.client_email || 'Client contact not added yet.'}</p>
        </div>
        <div className="case-hero__meta">
          <span className="badge">{caseRecord.status}</span>
          <span className="case-hero__progress">{progressLabel}</span>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Matter brief</p>
            <h2>Case details</h2>
          </div>
        </div>
        <div className="details-grid">
          <article className="record-item">
            <div>
              <strong>Summary</strong>
              <p>{caseRecord.summary || 'No summary added yet.'}</p>
            </div>
          </article>
          <article className="record-item">
            <div>
              <strong>Next step</strong>
              <p>{caseRecord.next_step || 'No next step added yet.'}</p>
            </div>
          </article>
          <article className="record-item">
            <div>
              <strong>Client link</strong>
              <p>{caseRecord.client_access_enabled ? 'Active until case closure or manual pause.' : 'Currently disabled.'}</p>
            </div>
            <a
              className="icon-button"
              href={buildCaseAccessLink(caseRecord.client_access_token)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open client view"
              title="Open client view"
            >
              <ShareIcon className="app-icon" />
            </a>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lifecycle</p>
            <h2>Progress control</h2>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            aria-label="Add lifecycle step"
            title="Add lifecycle step"
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
                  <strong>Step {index + 1}</strong>
                </div>
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateLifecycleField(step.id, 'title', e.target.value)}
                  placeholder="Step title"
                />
                <input
                  type="month"
                  value={step.eta || ''}
                  onChange={(e) => updateLifecycleField(step.id, 'eta', e.target.value)}
                />
              </div>
              <select value={step.status} onChange={(e) => updateLifecycleStatus(step.id, e.target.value)}>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Payments</p>
            <h2>Request or record fees</h2>
          </div>
          <div className="header-icon-group">
            <PaymentsIcon className="app-icon section-icon" />
            <button
              type="button"
              className="icon-button icon-button--accent"
              aria-label={showPaymentForm ? 'Close payment form' : 'Open payment form'}
              title={showPaymentForm ? 'Close payment form' : 'Open payment form'}
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
              <label>Amount:</label>
              <input
                type="number"
                placeholder="Amount in INR"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((current) => ({ ...current, amount: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Date:</label>
              <input
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm((current) => ({ ...current, date: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Stage:</label>
              <input
                type="text"
                placeholder="Filing, hearing, drafting, etc."
                value={paymentForm.stage}
                onChange={(e) => setPaymentForm((current) => ({ ...current, stage: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Payment mode:</label>
              <select
                value={paymentForm.requestedFromClient ? 'request' : 'recorded'}
                onChange={(e) =>
                  setPaymentForm((current) => ({
                    ...current,
                    requestedFromClient: e.target.value === 'request',
                  }))
                }
              >
                <option value="request">Request from client</option>
                <option value="recorded">Record received payment</option>
              </select>
            </div>
            <div className="form-group full-span">
              <label>Description:</label>
              <input
                type="text"
                placeholder="What is this payment for?"
                value={paymentForm.description}
                onChange={(e) => setPaymentForm((current) => ({ ...current, description: e.target.value }))}
                required
              />
            </div>
          </div>
          <button type="submit" className="button">
            {paymentForm.requestedFromClient ? 'Request payment' : 'Save payment'}
          </button>
        </form>
        ) : (
          <p className="empty-state">Open the fee form when you need to request a payment or record a received amount.</p>
        )}
        <div className="record-list top-space">
          {payments.map((payment) => (
            <article key={payment.id} className="record-item">
              <div>
                <strong>{payment.description || payment.stage || 'Case fee'}</strong>
                <p>{payment.stage || 'Case fee'} | {payment.date}</p>
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
