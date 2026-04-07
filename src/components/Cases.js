import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink, createCaseAccessToken } from '../utils/caseAccess';
import { ArrowRightIcon, CloseIcon, EyeIcon, MessageIcon, PlusIcon, WhatsAppIcon } from './AppIcons';

const defaultLifecycle = [
  { title: 'Initial consultation', eta: 'Apr 2026' },
  { title: 'Draft petition and evidence set', eta: 'May 2026' },
  { title: 'File before court', eta: 'Jun 2026' },
  { title: 'Attend hearing and next directions', eta: 'Jul 2026' },
  { title: 'Order follow-up and closure', eta: 'Aug 2026' },
];

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

const createLifecycle = (customSteps) => {
  const steps = customSteps.length ? customSteps : defaultLifecycle;
  return steps.map((step, index) => ({
    id: `step-${index + 1}`,
    title: step.title,
    eta: step.eta || '',
    status: index === 0 ? 'in_progress' : 'pending',
  }));
};

const buildShareMessage = (caseItem) =>
  `iAdvocate has shared your case updates for ${caseItem.case_number}. Open your case link here: ${buildCaseAccessLink(
    caseItem.client_access_token
  )}`;

const buildWhatsAppShareLink = (caseItem) =>
  `https://wa.me/?text=${encodeURIComponent(buildShareMessage(caseItem))}`;

const buildSmsShareLink = (caseItem) =>
  `sms:?&body=${encodeURIComponent(buildShareMessage(caseItem))}`;

const formatTimelineMonth = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-');
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
      new Date(Number(year), Number(month) - 1, 1)
    );
  }
  return value;
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
  const [selectedLifecyclePreset, setSelectedLifecyclePreset] = useState(lifecyclePresets[0]);
  const [selectedLifecycleEta, setSelectedLifecycleEta] = useState('');
  const [lifecycleSteps, setLifecycleSteps] = useState(defaultLifecycle);

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
        const activeMilestone = lifecycle.find((step) => step.status !== 'done') || lifecycle[lifecycle.length - 1];
        const totalSteps = lifecycle.length || 1;
        return {
          ...caseItem,
          completedSteps,
          totalSteps,
          activeMilestone,
        };
      }),
    [cases]
  );

  const updateLifecycleDraft = (index, key, value) => {
    setLifecycleSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, [key]: value } : step))
    );
  };

  const addLifecycleStep = () => {
    setLifecycleSteps((current) => [
      ...current,
      {
        title: selectedLifecyclePreset,
        eta: selectedLifecycleEta,
      },
    ]);
    setSelectedLifecycleEta('');
  };

  const handleAddCase = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;

    const preparedLifecycle = lifecycleSteps
      .map((step) => ({
        title: step.title.trim(),
        eta: step.eta.trim(),
      }))
      .filter((step) => step.title);

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
      lifecycle: createLifecycle(preparedLifecycle),
    });

    setCaseNumber('');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setSummary('');
    setNextStep('');
    setStatus('Open');
    setSelectedLifecyclePreset(lifecyclePresets[0]);
    setSelectedLifecycleEta('');
    setLifecycleSteps(defaultLifecycle);
    setShowForm(false);
    await fetchCases();
  };

  return (
    <PageShell
      title="Cases"
      subtitle="Create, review, and share matters with clearer lifecycle planning for both advocate and client views."
      showBack
    >
      <section className={`panel${showForm ? '' : ' panel--collapsed'}`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">New matter</p>
            <h2>Add a case</h2>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            aria-label={showForm ? 'Close add case form' : 'Open add case form'}
            title={showForm ? 'Close add case form' : 'Open add case form'}
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
          </button>
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
            <div className="form-group">
              <label>Step preset:</label>
              <select value={selectedLifecyclePreset} onChange={(e) => setSelectedLifecyclePreset(e.target.value)}>
                {lifecyclePresets.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tentative month:</label>
              <input
                type="month"
                value={selectedLifecycleEta}
                onChange={(e) => setSelectedLifecycleEta(e.target.value)}
              />
            </div>
            <div className="form-group full-span">
              <label>Lifecycle planning:</label>
              <div className="planning-stack">
                {lifecycleSteps.map((step, index) => (
                  <div key={`draft-${index + 1}`} className="planning-row">
                    <input
                      type="text"
                      value={step.title}
                      onChange={(e) => updateLifecycleDraft(index, 'title', e.target.value)}
                      placeholder="Step title"
                      required
                    />
                    <input
                      type="month"
                      value={step.eta}
                      onChange={(e) => updateLifecycleDraft(index, 'eta', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group full-span">
              <button
                type="button"
                className="button secondary"
                onClick={addLifecycleStep}
              >
                Add lifecycle step
              </button>
            </div>
          </div>
          <button type="submit" className="button">Add Case</button>
          </form>
        ) : (
          <p className="empty-state">Tap the plus icon to create a new matter with planned milestones and a client access link.</p>
        )}
      </section>

      {!showForm ? (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current matters</p>
            <h2>{cases.length} case board</h2>
          </div>
        </div>
        {cases.length === 0 ? (
          <p className="empty-state">No cases yet. Add your first matter to start tracking progress.</p>
        ) : (
          <div className="matter-board">
            {caseSummaries.map((caseItem) => (
              <article key={caseItem.id} className="matter-row">
                <div className="matter-row__main">
                  <div>
                    <strong>{caseItem.case_number}</strong>
                    <p>{caseItem.client_name}</p>
                    <p className="case-status-text">{caseItem.status}</p>
                  </div>
                </div>
                <div className="matter-row__meta">
                  <span>{caseItem.next_step || 'No next step added yet.'}</span>
                  <span>{caseItem.activeMilestone?.title || 'No lifecycle planned'}{caseItem.activeMilestone?.eta ? ` | ${formatTimelineMonth(caseItem.activeMilestone.eta)}` : ''}</span>
                </div>
                <div className="progress-strip matter-row__progress">
                  <span>{caseItem.completedSteps}/{caseItem.totalSteps} milestones complete</span>
                  <span>{caseItem.client_access_enabled ? 'Client link live' : 'Client link paused'}</span>
                </div>
                <div className="matter-row__actions">
                  <a
                    className="icon-button"
                    href={buildWhatsAppShareLink(caseItem)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on WhatsApp"
                    title="Share on WhatsApp"
                  >
                    <WhatsAppIcon className="app-icon" />
                  </a>
                  <a
                    className="icon-button"
                    href={buildSmsShareLink(caseItem)}
                    aria-label="Share by SMS"
                    title="Share by SMS"
                  >
                    <MessageIcon className="app-icon" />
                  </a>
                  <a
                    className="icon-button"
                    href={buildCaseAccessLink(caseItem.client_access_token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Preview client case view"
                    title="Preview client case view"
                  >
                    <EyeIcon className="app-icon" />
                  </a>
                  <button
                    type="button"
                    className="icon-button icon-button--accent"
                    aria-label="Open case details"
                    title="Open case details"
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
      ) : null}
    </PageShell>
  );
};

export default Cases;
