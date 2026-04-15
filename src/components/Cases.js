import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { ArrowRightIcon, CloseIcon, PlusIcon } from './AppIcons';
import LoadingState from './LoadingState';
import { syncAdvocateClientAccess, syncCaseAccessRecord } from '../utils/clientAccessRecords';
import { createCaseAccessToken } from '../utils/caseAccess';
import { createLifecycleStep, formatLifecycleDate, getLifecycleDisplayDate, isHearingLifecycleStep } from '../utils/lifecycle';

const todayIso = () => new Date().toISOString().split('T')[0];

const emptyLifecycleDraft = {
  title: '',
  stageType: 'general',
  eta: '',
  scheduledDate: '',
  notes: '',
};

const createDefaultLifecycle = () => [
  createLifecycleStep({
    id: 'step-1',
    title: 'Initial consultation',
    stageType: 'general',
    scheduledDate: todayIso(),
    status: 'in_progress',
  }),
];

const Cases = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [caseNumber, setCaseNumber] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [summary, setSummary] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [court, setCourt] = useState('');
  const [place, setPlace] = useState('');
  const [policeStation, setPoliceStation] = useState('');
  const [status, setStatus] = useState('Open');
  const [loading, setLoading] = useState(true);
  const [showLifecycleComposer, setShowLifecycleComposer] = useState(false);
  const [lifecycleDraft, setLifecycleDraft] = useState(emptyLifecycleDraft);
  const [lifecycleSteps, setLifecycleSteps] = useState([]);

  const advocateId = auth.currentUser?.uid;

  const fetchWorkspace = useCallback(async () => {
    if (!advocateId) {
      setLoading(false);
      return;
    }
    try {
      await syncAdvocateClientAccess(advocateId);
      const [casesSnapshot, clientsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId))),
      ]);
      setCases(casesSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setClients(clientsSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    } finally {
      setLoading(false);
    }
  }, [advocateId]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

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
          nextHearing: lifecycle.find((step) => isHearingLifecycleStep(step) && step.scheduled_date && step.status !== 'done'),
        };
      }),
    [cases]
  );

  const resetCaseForm = () => {
    setCaseNumber('');
    setSelectedClientId('');
    setSummary('');
    setNextStep('');
    setCourt('');
    setPlace('');
    setPoliceStation('');
    setStatus('Open');
    setShowLifecycleComposer(false);
    setLifecycleDraft(emptyLifecycleDraft);
    setLifecycleSteps([]);
  };

  const addLifecycleStep = () => {
    if (!lifecycleDraft.title.trim()) {
      return;
    }

    setLifecycleSteps((current) => [
      ...current,
      createLifecycleStep({
        id: `step-${current.length + 1}`,
        title: lifecycleDraft.title.trim(),
        eta: lifecycleDraft.eta,
        stageType: lifecycleDraft.stageType,
        scheduledDate: lifecycleDraft.scheduledDate,
        notes: lifecycleDraft.notes.trim(),
        status: current.length === 0 ? 'in_progress' : 'pending',
      }),
    ]);
    setLifecycleDraft(emptyLifecycleDraft);
    setShowLifecycleComposer(false);
  };

  const handleAddCase = async (event) => {
    event.preventDefault();
    if (!advocateId || !selectedClient) return;

    const lifecycle = lifecycleSteps.length ? lifecycleSteps : createDefaultLifecycle();
    const clientAccessToken = createCaseAccessToken(caseNumber);

    const payload = {
      advocate_id: advocateId,
      client_id: selectedClient.id,
      case_number: caseNumber,
      client_name: selectedClient.name,
      client_email: selectedClient.email || '',
      client_phone: selectedClient.phone || '',
      summary,
      next_step: nextStep,
      court,
      place,
      police_station: policeStation,
      status,
      client_access_enabled: true,
      client_access_token: clientAccessToken,
      advocate_language: i18n.language || 'en',
      client_language: selectedClient.preferredLanguage || i18n.language || 'en',
      lifecycle,
    };

    const caseDocRef = await addDoc(collection(db, 'cases'), payload);
    await syncCaseAccessRecord({ id: caseDocRef.id, ...payload });

    resetCaseForm();
    setShowForm(false);
    await fetchWorkspace();
  };

  return (
    <PageShell title={t('cases')} subtitle={t('casesSubtitle')} showBack>
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
        <>
          <section className={`panel${showForm ? '' : ' panel--collapsed'}`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('newMatter')}</p>
                <h2>{t('addCase')}</h2>
              </div>
              <button
                type="button"
                className="icon-button icon-button--accent"
                aria-label={showForm ? t('closeAddCaseForm') : t('openAddCaseForm')}
                title={showForm ? t('closeAddCaseForm') : t('openAddCaseForm')}
                onClick={() => {
                  setShowForm((current) => !current);
                  if (showForm) {
                    resetCaseForm();
                  }
                }}
              >
                {showForm ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
              </button>
            </div>
            {showForm ? (
              clients.length === 0 ? (
                <div className="workflow-helper-card">
                  <strong>{t('clients')}</strong>
                  <p>{t('clientsEmpty')}</p>
                  <button type="button" className="button" onClick={() => navigate('/clients')}>
                    {t('addClient')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddCase}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>{t('clientLabel')}:</label>
                      <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} required>
                        <option value="">{t('selectClient')}</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>{client.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t('caseNumber')}:</label>
                      <input
                        type="text"
                        placeholder="e.g. DEL-CIV-204/2026"
                        value={caseNumber}
                        onChange={(event) => setCaseNumber(event.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group full-span">
                      <label>{t('caseSummary')}:</label>
                      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
                    </div>
                    <div className="form-group full-span">
                      <label>{t('nextStep')}:</label>
                      <input type="text" value={nextStep} onChange={(event) => setNextStep(event.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('court')}:</label>
                      <input type="text" value={court} onChange={(event) => setCourt(event.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('place')}:</label>
                      <input type="text" value={place} onChange={(event) => setPlace(event.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('policeStation')}:</label>
                      <input type="text" value={policeStation} onChange={(event) => setPoliceStation(event.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('statusLabel')}:</label>
                      <select value={status} onChange={(event) => setStatus(event.target.value)}>
                        <option value="Open">Open</option>
                        <option value="Pending">Pending</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div className="section-heading top-space">
                    <div>
                      <p className="eyebrow">{t('lifecycle')}</p>
                      <h2>{t('lifecyclePlanning')}</h2>
                    </div>
                    <button
                      type="button"
                      className="icon-button icon-button--accent"
                      onClick={() => setShowLifecycleComposer((current) => !current)}
                      aria-label={showLifecycleComposer ? t('closeAddStageForm') : t('addLifecycleStep')}
                      title={showLifecycleComposer ? t('closeAddStageForm') : t('addLifecycleStep')}
                    >
                      {showLifecycleComposer ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
                    </button>
                  </div>

                  {showLifecycleComposer ? (
                    <div className="planning-stack">
                      <input
                        type="text"
                        value={lifecycleDraft.title}
                        onChange={(event) => setLifecycleDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder={t('stepTitle')}
                      />
                      <select
                        value={lifecycleDraft.stageType}
                        onChange={(event) => setLifecycleDraft((current) => ({ ...current, stageType: event.target.value }))}
                      >
                        <option value="general">{t('generalStage')}</option>
                        <option value="hearing">{t('hearingStage')}</option>
                      </select>
                      <input
                        type="month"
                        value={lifecycleDraft.eta}
                        onChange={(event) => setLifecycleDraft((current) => ({ ...current, eta: event.target.value }))}
                      />
                      <input
                        type="date"
                        value={lifecycleDraft.scheduledDate}
                        onChange={(event) => setLifecycleDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
                      />
                      <textarea
                        value={lifecycleDraft.notes}
                        onChange={(event) => setLifecycleDraft((current) => ({ ...current, notes: event.target.value }))}
                        placeholder={t('stageNotesPlaceholder')}
                      />
                      <button type="button" className="button button--secondary" onClick={addLifecycleStep}>
                        {t('addLifecycleStep')}
                      </button>
                    </div>
                  ) : (
                    <p className="empty-state">{t('lifecycleFormHint')}</p>
                  )}

                  {lifecycleSteps.length ? (
                    <div className="record-list top-space">
                      {lifecycleSteps.map((step) => (
                        <article key={step.id} className="record-item record-item--stack">
                          <div>
                            <strong>{step.title}</strong>
                            <p>{getLifecycleDisplayDate(step) || t('dateToBeUpdated')}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <button type="submit" className="button top-space">{t('addCaseButton')}</button>
                </form>
              )
            ) : (
              <p className="empty-state">{t('addMatterHint')}</p>
            )}
          </section>

          {!showForm ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t('currentMatters')}</p>
                  <h2>{cases.length} {t('caseBoard')}</h2>
                </div>
              </div>
              {cases.length === 0 ? (
                <p className="empty-state">{t('noCasesYet')}</p>
              ) : (
                <div className="matter-board">
                  {caseSummaries.map((caseItem) => (
                    <article
                      key={caseItem.id}
                      className="matter-row matter-row--interactive"
                      onClick={() => navigate(`/cases/${caseItem.id}`)}
                    >
                      <div className="matter-row__main">
                        <div>
                          <strong>{caseItem.case_number}</strong>
                          <p>{caseItem.client_name}</p>
                          <p className="case-status-text">{caseItem.status}</p>
                        </div>
                      </div>
                      <div className="matter-row__meta">
                        <span>{caseItem.next_step || t('noNextStepYet')}</span>
                        <span>
                          {caseItem.activeMilestone?.title || t('noLifecyclePlanned')}
                          {getLifecycleDisplayDate(caseItem.activeMilestone) ? ` | ${getLifecycleDisplayDate(caseItem.activeMilestone)}` : ''}
                        </span>
                        {caseItem.nextHearing ? (
                          <span>{t('nextHearingLabel')} {caseItem.nextHearing.title} | {formatLifecycleDate(caseItem.nextHearing.scheduled_date)}</span>
                        ) : null}
                      </div>
                      <div className="progress-strip matter-row__progress">
                        <span>{caseItem.completedSteps}/{caseItem.totalSteps} {t('milestonesComplete')}</span>
                        <span>{caseItem.client_access_enabled ? t('clientLinkLive') : t('clientLinkPaused')}</span>
                      </div>
                      <div className="matter-row__actions">
                        <button
                          type="button"
                          className="icon-button icon-button--accent"
                          aria-label={t('openCaseDetails')}
                          title={t('openCaseDetails')}
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/cases/${caseItem.id}`);
                          }}
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
        </>
      )}
    </PageShell>
  );
};

export default Cases;
