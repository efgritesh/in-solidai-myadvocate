import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink, createCaseAccessToken } from '../utils/caseAccess';

const defaultLifecycle = [
  'Initial consultation',
  'Draft petition and evidence set',
  'File before court',
  'Attend hearing and next directions',
  'Order follow-up and closure',
];

const createLifecycle = (customSteps) => {
  const titles = customSteps.length ? customSteps : defaultLifecycle;
  return titles.map((title, index) => ({
    id: `step-${index + 1}`,
    title,
    status: index === 0 ? 'in_progress' : 'pending',
  }));
};

const Cases = () => {
  const [cases, setCases] = useState([]);
  const [caseNumber, setCaseNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [summary, setSummary] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [status, setStatus] = useState('Open');
  const [lifecycleInput, setLifecycleInput] = useState('');

  const fetchCases = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const querySnapshot = await getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId)));
    setCases(querySnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleAddCase = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;

    await addDoc(collection(db, 'cases'), {
      advocate_id: advocateId,
      case_number: caseNumber,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      summary,
      next_step: nextStep,
      status,
      client_access_enabled: true,
      client_access_token: createCaseAccessToken(caseNumber),
      lifecycle: createLifecycle(
        lifecycleInput
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean)
      ),
    });

    setCaseNumber('');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setSummary('');
    setNextStep('');
    setStatus('Open');
    setLifecycleInput('');
    await fetchCases();
  };

  const updateLifecycleStatus = async (caseId, stepId, nextStatus) => {
    const selectedCase = cases.find((caseItem) => caseItem.id === caseId);
    if (!selectedCase) return;

    const lifecycle = (selectedCase.lifecycle || []).map((step) =>
      step.id === stepId ? { ...step, status: nextStatus } : step
    );

    await updateDoc(doc(db, 'cases', caseId), { lifecycle });
    await fetchCases();
  };

  const toggleClientAccess = async (caseId, currentValue) => {
    await updateDoc(doc(db, 'cases', caseId), {
      client_access_enabled: !currentValue,
    });
    await fetchCases();
  };

  const copyCaseLink = async (token) => {
    await navigator.clipboard.writeText(buildCaseAccessLink(token));
    alert('Client case link copied.');
  };

  return (
    <PageShell
      title="Cases"
      subtitle="Manage matter details and send each client a persistent case access link."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">New matter</p>
            <h2>Add a case</h2>
          </div>
        </div>
        <form onSubmit={handleAddCase}>
          <div className="form-grid">
            <div className="form-group">
              <label>Case Number:</label>
              <input
                type="text"
                placeholder="e.g. DEL-CIV-204/2026"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Client Name:</label>
              <input
                type="text"
                placeholder="Client full name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Client Email:</label>
              <input
                type="email"
                placeholder="For WhatsApp or email follow-up"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Client Phone:</label>
              <input
                type="text"
                placeholder="WhatsApp-enabled number"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
            </div>
            <div className="form-group full-span">
              <label>Case Summary:</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What should the client understand about this matter?"
              />
            </div>
            <div className="form-group full-span">
              <label>Next Step:</label>
              <input
                type="text"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="What is currently pending or next?"
              />
            </div>
            <div className="form-group">
              <label>Status:</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Open">Open</option>
                <option value="Pending">Pending</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div className="form-group full-span">
              <label>Lifecycle steps:</label>
              <textarea
                value={lifecycleInput}
                onChange={(e) => setLifecycleInput(e.target.value)}
                placeholder={'Optional custom steps, one per line.\nLeave empty to use the built-in case lifecycle.'}
              />
            </div>
          </div>
          <button type="submit" className="button">Add Case</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current matters</p>
            <h2>{cases.length} cases</h2>
          </div>
        </div>
        {cases.length === 0 ? (
          <p className="empty-state">No cases yet. Add your first matter to start tracking progress.</p>
        ) : (
          <div className="record-list">
            {cases.map((caseItem) => (
              <article key={caseItem.id} className="record-item record-item--stack">
                <div className="case-card__header">
                  <div>
                    <strong>{caseItem.case_number}</strong>
                    <p>{caseItem.client_name}</p>
                    <p>{caseItem.next_step || 'No next step added yet.'}</p>
                  </div>
                  <span className="badge">{caseItem.status}</span>
                </div>

                <div className="case-link-panel">
                  <input value={buildCaseAccessLink(caseItem.client_access_token)} readOnly />
                  <div className="inline-actions">
                    <button type="button" className="ghost-button" onClick={() => copyCaseLink(caseItem.client_access_token)}>
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => toggleClientAccess(caseItem.id, caseItem.client_access_enabled)}
                    >
                      {caseItem.client_access_enabled ? 'Disable link' : 'Enable link'}
                    </button>
                  </div>
                </div>

                <div className="lifecycle-editor">
                  {(caseItem.lifecycle || []).map((step) => (
                    <div key={step.id} className="lifecycle-row">
                      <span>{step.title}</span>
                      <select
                        value={step.status}
                        onChange={(e) => updateLifecycleStatus(caseItem.id, step.id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                      </select>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Cases;
