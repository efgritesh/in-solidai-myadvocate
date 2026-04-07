import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink, createCaseAccessToken } from '../utils/caseAccess';
import { ArrowRightIcon, CopyIcon, EyeIcon, PlusIcon } from './AppIcons';

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
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [showForm, setShowForm] = useState(false);
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

  const caseSummaries = useMemo(
    () =>
      cases.map((caseItem) => {
        const lifecycle = caseItem.lifecycle || [];
        const completedSteps = lifecycle.filter((step) => step.status === 'done').length;
        const totalSteps = lifecycle.length || 1;
        return {
          ...caseItem,
          completedSteps,
          totalSteps,
        };
      }),
    [cases]
  );

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
    setShowForm(false);
    await fetchCases();
  };

  const copyCaseLink = async (token) => {
    await navigator.clipboard.writeText(buildCaseAccessLink(token));
    alert('Client case link copied.');
  };

  return (
    <PageShell
      title="Cases"
      subtitle="Scan active matters quickly, then open each case for full details, payment requests, and client access."
      showBack
      actions={
        <button
          type="button"
          className="icon-button icon-button--accent"
          aria-label={showForm ? 'Close add case form' : 'Add a case'}
          onClick={() => setShowForm((current) => !current)}
        >
          <PlusIcon className="app-icon" />
        </button>
      }
    >
      <section className={`panel${showForm ? '' : ' panel--collapsed'}`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">New matter</p>
            <h2>Add a case</h2>
          </div>
        </div>
        {showForm ? (
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
        ) : (
          <p className="empty-state">Use the plus icon to add a new matter with lifecycle steps and a client access link.</p>
        )}
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
          <div className="case-stack">
            {caseSummaries.map((caseItem) => (
              <article key={caseItem.id} className="case-summary-card">
                <div className="case-summary-card__row">
                  <div>
                    <strong>{caseItem.case_number}</strong>
                    <p>{caseItem.client_name}</p>
                  </div>
                  <span className="badge">{caseItem.status}</span>
                </div>
                <p className="case-summary-card__next">{caseItem.next_step || 'No next step added yet.'}</p>
                <div className="progress-strip">
                  <span>{caseItem.completedSteps}/{caseItem.totalSteps} milestones complete</span>
                  <span>{caseItem.client_access_enabled ? 'Client link live' : 'Client link paused'}</span>
                </div>
                <div className="case-summary-card__actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Copy client case link"
                    onClick={() => copyCaseLink(caseItem.client_access_token)}
                  >
                    <CopyIcon className="app-icon" />
                  </button>
                  <a
                    className="icon-button"
                    href={buildCaseAccessLink(caseItem.client_access_token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open client case view"
                  >
                    <EyeIcon className="app-icon" />
                  </a>
                  <button
                    type="button"
                    className="icon-button icon-button--accent"
                    aria-label="Open case details"
                    onClick={() => navigate(`/cases/${caseItem.id}`)}
                  >
                    <ArrowRightIcon className="app-icon" />
                  </button>
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
