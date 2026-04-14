import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon, CasesIcon, CopyIcon, DeleteIcon, DocumentsIcon, InfoIcon, PlusIcon } from './AppIcons';
import {
  createDraftingSession,
  exportDraftingDocx,
  extractDraftingSources,
  generateDraftingOutput,
  getStorageUrl,
  publishDraftingOutput,
  registerDraftingSource,
  uploadDraftingFile,
} from '../utils/drafting';
import { createClientProfile } from '../utils/clientProfiles';
import {
  genderOptions,
  isClientDraftReady,
  relationLabelOptions,
} from '../utils/draftingProfiles';

const emptyDraftForm = {
  clientId: '',
  caseId: '',
  instructions: '',
};

const emptyClientForm = {
  name: '',
  phone: '',
  email: '',
  preferredLanguage: 'en',
  relationLabel: 'S/o',
  relationName: '',
  age: '',
  dateOfBirth: '',
  gender: 'Male',
  address: '',
  aadhaarName: '',
  aadhaarNumber: '',
};

const workflowLabels = {
  draft: 'Ready to start',
  extracting: 'Reading source files',
  ready_for_review: 'Validate key facts',
  generating: 'Preparing first draft',
  completed: 'Draft ready',
  failed: 'Needs attention',
};

const createProgressState = (overrides = {}) => ({
  active: false,
  stageKey: 'idle',
  stageLabel: '',
  detail: '',
  currentStep: 0,
  totalSteps: 4,
  uploadedFiles: 0,
  estimatedTokens: 0,
  ...overrides,
});

const findClientIdForCaseRecord = (caseRecord, clientList = []) => {
  if (!caseRecord) return '';
  if (caseRecord.client_id) return caseRecord.client_id;
  const matchedClient = clientList.find((client) =>
    client.name === caseRecord.client_name ||
    (client.email && client.email === caseRecord.client_email) ||
    (client.phone && client.phone === caseRecord.client_phone)
  );
  return matchedClient?.id || '';
};

const DraftingAssistant = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId') || '';
  const caseParam = searchParams.get('caseId') || '';
  const view = searchParams.get('view') || '';
  const advocateId = auth.currentUser?.uid || '';

  const [draftForm, setDraftForm] = useState(emptyDraftForm);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [output, setOutput] = useState(null);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [validationFields, setValidationFields] = useState([]);
  const [progress, setProgress] = useState(createProgressState());

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === sessionParam) || null,
    [sessionParam, sessions]
  );

  const activeClient = useMemo(
    () => clients.find((client) => client.id === draftForm.clientId) || null,
    [clients, draftForm.clientId]
  );

  const activeCase = useMemo(
    () => cases.find((caseRecord) => caseRecord.id === draftForm.caseId) || null,
    [cases, draftForm.caseId]
  );

  const availableCases = useMemo(() => {
    if (!draftForm.clientId) return cases;
    return cases.filter((caseRecord) => {
      if (caseRecord.client_id) return caseRecord.client_id === draftForm.clientId;
      const matchedClient = clients.find((client) => client.id === draftForm.clientId);
      return (
        caseRecord.client_name === matchedClient?.name ||
        (matchedClient?.phone && caseRecord.client_phone === matchedClient.phone) ||
        (matchedClient?.email && caseRecord.client_email === matchedClient.email)
      );
    });
  }, [cases, clients, draftForm.clientId]);

  const fetchArtifacts = useCallback(async (sessionId, ownerId = auth.currentUser?.uid) => {
    if (!sessionId || !ownerId) return { nextSources: [], nextOutput: null };
    const [sourcesSnapshot, outputSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'drafting_sources'), where('session_id', '==', sessionId), where('advocate_id', '==', ownerId))),
      getDocs(query(collection(db, 'drafting_outputs'), where('session_id', '==', sessionId), where('advocate_id', '==', ownerId))),
    ]);
    return {
      nextSources: sourcesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      nextOutput: outputSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))[0] || null,
    };
  }, []);

  const loadWorkspace = useCallback(async (targetSessionId = sessionParam) => {
    if (!advocateId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [casesSnapshot, clientsSnapshot, sessionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'drafting_sessions'), where('advocate_id', '==', advocateId))),
      ]);

      const nextCases = casesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const nextClients = clientsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const nextSessions = sessionsSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => (right.updated_at?.seconds || 0) - (left.updated_at?.seconds || 0));

      setCases(nextCases);
      setClients(nextClients);
      setSessions(nextSessions);

      const selectedSession = targetSessionId ? nextSessions.find((session) => session.id === targetSessionId) || null : null;
      if (selectedSession) {
        setDraftForm({
          clientId: selectedSession.client_id || findClientIdForCaseRecord(nextCases.find((caseRecord) => caseRecord.id === selectedSession.case_id) || null, nextClients),
          caseId: selectedSession.case_id || '',
          instructions: selectedSession.instructions || '',
        });
        const { nextOutput } = await fetchArtifacts(selectedSession.id, advocateId);
        setOutput(nextOutput);
        setValidationFields(nextOutput?.fact_validation_fields || []);
      } else {
        const selectedCase = nextCases.find((caseRecord) => caseRecord.id === caseParam) || null;
        setDraftForm({
          clientId: findClientIdForCaseRecord(selectedCase, nextClients),
          caseId: selectedCase?.id || '',
          instructions: selectedCase ? `${t('draftingCasePrefillInstructions')} ${selectedCase.case_number}.` : '',
        });
        setOutput(null);
        setValidationFields([]);
      }

      setStatusMessage('');
    } catch (error) {
      setStatusMessage(error.message || 'Unable to load the drafting workflow right now.');
    } finally {
      setLoading(false);
    }
  }, [advocateId, caseParam, fetchArtifacts, sessionParam, t]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const buildSessionPatch = useCallback(() => {
    const client = clients.find((item) => item.id === draftForm.clientId) || null;
    const caseRecord = cases.find((item) => item.id === draftForm.caseId) || null;
    return {
      client_id: client?.id || '',
      client_name: client?.name || caseRecord?.client_name || '',
      case_id: caseRecord?.id || '',
      case_number: caseRecord?.case_number || '',
      instructions: draftForm.instructions,
      output_language: client?.preferredLanguage || caseRecord?.client_language || 'en',
      client_profile_snapshot: client ? {
        clientId: client.id,
        name: client.name || '',
        phone: client.phone || '',
        email: client.email || '',
        preferredLanguage: client.preferredLanguage || 'en',
        relationLabel: client.relationLabel || '',
        relationName: client.relationName || '',
        age: client.age || '',
        dateOfBirth: client.dateOfBirth || '',
        gender: client.gender || '',
        address: client.address || '',
        aadhaarName: client.aadhaarName || '',
        aadhaarNumber: client.aadhaarNumber || '',
      } : {},
      case_snapshot: caseRecord ? {
        caseId: caseRecord.id,
        caseNumber: caseRecord.case_number || '',
        clientName: caseRecord.client_name || '',
        court: caseRecord.court || '',
        place: caseRecord.place || '',
        policeStation: caseRecord.police_station || '',
        status: caseRecord.status || '',
        summary: caseRecord.summary || '',
        nextStep: caseRecord.next_step || '',
      } : {},
      updated_at: new Date(),
    };
  }, [cases, clients, draftForm.caseId, draftForm.clientId, draftForm.instructions]);

  const ensureSession = useCallback(async () => {
    if (sessionParam) {
      await updateDoc(doc(db, 'drafting_sessions', sessionParam), buildSessionPatch());
      return sessionParam;
    }

    const created = await createDraftingSession({
      clientId: draftForm.clientId,
      caseId: draftForm.caseId,
      draftType: 'auto',
      customDraftType: '',
      instructions: draftForm.instructions,
    });

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('sessionId', created.sessionId);
      if (draftForm.caseId) next.set('caseId', draftForm.caseId);
      return next;
    });

    return created.sessionId;
  }, [buildSessionPatch, draftForm.caseId, draftForm.clientId, draftForm.instructions, sessionParam, setSearchParams]);

  const estimatePromptTokens = useCallback(() => {
    const instructionTokens = Math.ceil((draftForm.instructions || '').trim().length / 4);
    const contextTokens = activeCase ? 180 : 90;
    const fileTokens = selectedFiles.length * 320;
    return instructionTokens + contextTokens + fileTokens;
  }, [activeCase, draftForm.instructions, selectedFiles.length]);

  const updateProgressStage = useCallback((stageKey, currentStep, detail, overrides = {}) => {
    const stageMap = {
      session: t('draftingProgressSession'),
      upload: t('draftingProgressUpload'),
      extract: t('draftingProgressExtract'),
      generate: t('draftingProgressGenerate'),
      validate: t('draftingProgressValidate'),
    };

    setProgress((current) => createProgressState({
      ...current,
      active: true,
      stageKey,
      stageLabel: stageMap[stageKey] || '',
      detail,
      currentStep,
      totalSteps: 4,
      uploadedFiles: selectedFiles.length,
      estimatedTokens: estimatePromptTokens(),
      ...overrides,
    }));
  }, [estimatePromptTokens, selectedFiles.length, t]);

  const startDrafting = async () => {
    if (!draftForm.clientId) {
      setStatusMessage(t('selectClientBeforeDrafting'));
      return;
    }
    if (!draftForm.instructions.trim()) {
      setStatusMessage(t('draftingInstructionsRequired'));
      return;
    }

    setWorking(true);
    setStatusMessage(t('draftingPreparing'));
    updateProgressStage('session', 1, t('draftingProgressSessionDetail'));
    try {
      const sessionId = await ensureSession();
      const sourceIds = [];

      if (selectedFiles.length) {
        updateProgressStage('upload', 2, t('draftingProgressUploadDetail', { count: selectedFiles.length }));
      }

      for (const file of selectedFiles) {
        const upload = await uploadDraftingFile({ advocateId, sessionId, file });
        const registered = await registerDraftingSource({
          sessionId,
          sourceType: 'uploaded_file',
          name: file.name,
          label: file.name,
          mimeType: file.type || 'application/octet-stream',
          storagePath: upload.storagePath,
          url: upload.url,
        });
        if (registered?.sourceId) sourceIds.push(registered.sourceId);
      }

      if (sourceIds.length) {
        updateProgressStage('extract', 3, t('draftingProgressExtractDetail', { count: sourceIds.length }));
        await extractDraftingSources({ sessionId, sourceIds });
      }

      updateProgressStage('generate', 4, t('draftingProgressGenerateDetail'));
      const generation = await generateDraftingOutput({ sessionId });
      const { nextOutput } = await fetchArtifacts(sessionId, advocateId);
      setOutput(nextOutput);
      setValidationFields(nextOutput?.fact_validation_fields || []);
      setSelectedFiles([]);
      await loadWorkspace(sessionId);
      if (generation.requiresValidation) {
        updateProgressStage('validate', 4, t('draftingProgressValidateDetail'));
      }
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('sessionId', sessionId);
        next.set('view', generation.requiresValidation ? 'validate' : 'review');
        return next;
      });
    } catch (error) {
      setStatusMessage(error.message);
      setProgress((current) => createProgressState({
        ...current,
        active: true,
        stageLabel: t('draftingProgressFailed'),
        detail: error.message,
      }));
    } finally {
      setWorking(false);
    }
  };

  const onDrop = useCallback((acceptedFiles) => {
    setSelectedFiles((current) => [...current, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop, disabled: working });

  const handleCreateClient = async (event) => {
    event.preventDefault();
    if (!advocateId) return;
    setWorking(true);
    try {
      const clientId = await createClientProfile({
        advocateId,
        data: {
          advocate_id: advocateId,
          ...clientForm,
          draftReady: true,
        },
        aadhaarFile,
      });
      setClientForm(emptyClientForm);
      setAadhaarFile(null);
      setShowNewClientForm(false);
      await loadWorkspace();
      setDraftForm((current) => ({ ...current, clientId }));
      setStatusMessage(t('clientAddedForDrafting'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const openSession = (sessionId) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('sessionId', sessionId);
      next.delete('view');
      return next;
    });
  };

  const clearSessionParams = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('sessionId');
      next.delete('view');
      return next;
    });
  };

  const handleDiscardSession = async (sessionId) => {
    if (!sessionId) return;
    setWorking(true);
    try {
      const [sourceSnapshot, outputSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'drafting_sources'), where('session_id', '==', sessionId), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'drafting_outputs'), where('session_id', '==', sessionId), where('advocate_id', '==', advocateId))),
      ]);
      await Promise.all([
        ...sourceSnapshot.docs.map((item) => deleteDoc(item.ref)),
        ...outputSnapshot.docs.map((item) => deleteDoc(item.ref)),
        deleteDoc(doc(db, 'drafting_sessions', sessionId)),
      ]);
      if (sessionId === sessionParam) {
        clearSessionParams();
        setDraftForm(emptyDraftForm);
        setOutput(null);
        setValidationFields([]);
      }
      await loadWorkspace();
      setStatusMessage('Drafting workflow discarded.');
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleValidationChange = (fieldKey, value) => {
    setValidationFields((current) => current.map((field) => (field.key === fieldKey ? { ...field, value } : field)));
  };

  const handleFactValidation = async () => {
    if (!currentSession) return;
    setWorking(true);
    setStatusMessage('Validating key facts and refreshing the draft.');
    try {
      const validatedFacts = validationFields.reduce((accumulator, field) => {
        accumulator[field.key] = field.value || '';
        return accumulator;
      }, {});

      const clientPatch = {};
      const advocatePatch = {};
      const casePatch = {};

      validationFields.forEach((field) => {
        if (!field.sourceField) return;
        if (field.target === 'client') clientPatch[field.sourceField] = field.value || '';
        if (field.target === 'advocate') advocatePatch[field.sourceField] = field.value || '';
        if (field.target === 'case') casePatch[field.sourceField] = field.value || '';
      });

      await updateDoc(doc(db, 'drafting_sessions', currentSession.id), {
        validated_facts: validatedFacts,
        ...buildSessionPatch(),
        updated_at: new Date(),
      });

      const updates = [];
      if (currentSession.client_id && Object.keys(clientPatch).length) {
        updates.push(updateDoc(doc(db, 'clients', currentSession.client_id), clientPatch));
      }
      if (Object.keys(advocatePatch).length) {
        updates.push(updateDoc(doc(db, 'users', advocateId), advocatePatch));
      }
      if (currentSession.case_id && Object.keys(casePatch).length) {
        updates.push(updateDoc(doc(db, 'cases', currentSession.case_id), casePatch));
      }
      await Promise.all(updates);

      const generation = await generateDraftingOutput({ sessionId: currentSession.id });
      const { nextOutput } = await fetchArtifacts(currentSession.id, advocateId);
      setOutput(nextOutput);
      setValidationFields(nextOutput?.fact_validation_fields || []);
      await loadWorkspace(currentSession.id);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('view', generation.requiresValidation ? 'validate' : 'review');
        return next;
      });
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleSaveDraftEdits = async () => {
    if (!output?.id) return;
    setWorking(true);
    try {
      await updateDoc(doc(db, 'drafting_outputs', output.id), { edited_text: output.edited_text, updated_at: new Date() });
      setStatusMessage(t('draftingDraftSaved'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!output?.edited_text) return;
    await navigator.clipboard.writeText(output.edited_text);
    setStatusMessage(t('draftingCopied'));
  };

  const handleExport = async () => {
    if (!output?.id || !currentSession) return;
    setWorking(true);
    try {
      const exportResult = await exportDraftingDocx({ sessionId: currentSession.id, outputId: output.id });
      const exportUrl = await getStorageUrl(exportResult.exportPath);
      window.open(exportUrl, '_blank', 'noopener,noreferrer');
      setStatusMessage(t('draftingExportReady'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handlePublish = async () => {
    if (!output?.id || !currentSession) return;
    setWorking(true);
    try {
      await publishDraftingOutput({ sessionId: currentSession.id, outputId: output.id });
      setStatusMessage(t('draftingPublishComplete'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <PageShell title={t('aiDraftingAssistant')} subtitle={t('aiDraftingSubtitle')} showBack><LoadingState label={t('loadingDraftingWorkspace')} /></PageShell>;
  }

  if (view === 'validate' && currentSession && output) {
    return (
      <PageShell
        title={t('validateDraftFacts')}
        subtitle={currentSession.case_number || activeClient?.name || t('aiDraftingSubtitle')}
        showBack
      >
        <section className="panel workflow-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{workflowLabels[currentSession.status] || t('review')}</p>
              <h2>{t('validateKeyFacts')}</h2>
            </div>
            <InfoIcon className="app-icon section-icon" />
          </div>
          <p className="helper-text">{t('factValidationHint')}</p>
          {validationFields.length ? (
            <div className="form-grid top-space">
              {validationFields.map((field) => (
                <div key={field.key} className="form-group">
                  <label>{field.label}</label>
                  <input type="text" value={field.value || ''} onChange={(event) => handleValidationChange(field.key, event.target.value)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="record-card top-space">
              <strong>{t('draftingNoValidationFieldsTitle')}</strong>
              <p className="helper-text">{t('draftingNoValidationFieldsBody')}</p>
            </div>
          )}
          <div className="button-row top-space">
            <button type="button" className="button" onClick={handleFactValidation} disabled={working}>{working ? t('generatingDraft') : t('applyFactsAndContinue')}</button>
            <button type="button" className="button button--secondary" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('view', 'review'); return next; })}>{t('skipToDraftReview')}</button>
          </div>
          {statusMessage ? <p className="inline-feedback">{statusMessage}</p> : null}
        </section>
      </PageShell>
    );
  }

  if (view === 'review' && output) {
    return (
      <PageShell
        title={t('firstDraft')}
        subtitle={currentSession?.case_number || activeClient?.name || t('aiDraftingSubtitle')}
        showBack
        actions={activeCase ? <button type="button" className="icon-button" onClick={() => navigate(`/cases/${activeCase.id}`)}><CasesIcon className="app-icon" /></button> : null}
      >
        <section className="panel draft-review-shell">
          <textarea
            className="draft-review-shell__editor"
            rows="24"
            value={output.edited_text || output.generated_text || ''}
            onChange={(event) => setOutput((current) => ({ ...current, edited_text: event.target.value }))}
          />
          <div className="button-row top-space">
            <button type="button" className="button" onClick={handleSaveDraftEdits} disabled={working}>{t('saveDraft')}</button>
            <button type="button" className="button button--secondary" onClick={handleCopy}><CopyIcon className="app-icon" /><span>{t('copyText')}</span></button>
            <button type="button" className="button button--secondary" onClick={handleExport} disabled={working}>{t('exportDocx')}</button>
            <button type="button" className="button button--secondary" onClick={handlePublish} disabled={working || !draftForm.caseId}>{t('publishToCaseDocuments')}</button>
          </div>
          {statusMessage ? <p className="inline-feedback">{statusMessage}</p> : null}
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t('aiDraftingAssistant')}
      subtitle={t('aiDraftingLeanSubtitle')}
      showBack
      actions={currentSession ? <button type="button" className="icon-button icon-button--danger" onClick={() => handleDiscardSession(currentSession.id)} disabled={working}><DeleteIcon className="app-icon" /></button> : null}
    >
      <section className="panel panel--accent workflow-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{currentSession ? t('resumeWorkflow') : t('startWorkflow')}</p>
            <h2>{currentSession ? workflowLabels[currentSession.status] || t('activeSession') : t('singleFlowDrafting')}</h2>
          </div>
          <InfoIcon className="app-icon section-icon" />
        </div>
        <div className="workflow-summary">
          <div className="workflow-summary__main">
            <strong>{activeClient?.name || t('selectClientBeforeDrafting')}</strong>
            <p>{activeCase ? `${activeCase.case_number} | ${activeCase.summary || activeCase.next_step || ''}` : t('draftingContextSubtitle')}</p>
          </div>
          <div className="workflow-summary__meta">
            <span className="badge">{currentSession ? workflowLabels[currentSession.status] || currentSession.status : t('readyToStart')}</span>
          </div>
        </div>
        {(working || progress.active) ? (
          <div className="record-card">
            <strong>{progress.stageLabel || t('processingDraftingRequest')}</strong>
            <p className="helper-text">{progress.detail || statusMessage || t('processingDraftingRequest')}</p>
            <div className="workflow-defaults">
              <span>{t('draftingProgressStepLabel', { current: progress.currentStep || 1, total: progress.totalSteps || 4 })}</span>
              <span>{t('draftingProgressFilesLabel', { count: progress.uploadedFiles || 0 })}</span>
              <span>{t('draftingProgressEstimatedTokensLabel', { count: progress.estimatedTokens || estimatePromptTokens() })}</span>
            </div>
            {working ? <LoadingState compact label={statusMessage || t('processing')} /> : null}
          </div>
        ) : null}
        {!progress.active && working ? <LoadingState compact label={statusMessage || t('processing')} /> : null}
        {!working && statusMessage ? <p className="inline-feedback">{statusMessage}</p> : null}
      </section>

      {sessions.length ? (
        <section className="panel workflow-card">
          <div className="section-heading">
            <div><p className="eyebrow">{t('savedWorkflows')}</p><h2>{t('resumeOrDiscard')}</h2></div>
          </div>
          <div className="record-list">
            {sessions.slice(0, 5).map((session) => (
              <article key={session.id} className="record-item">
                <button type="button" className="workflow-session" onClick={() => openSession(session.id)}>
                  <strong>{session.client_name || t('standaloneDraft')}</strong>
                  <p>{session.case_number || t('standaloneDraft')} | {workflowLabels[session.status] || session.status}</p>
                </button>
                <div className="inline-actions">
                  <button type="button" className="icon-button" onClick={() => openSession(session.id)}><ArrowRightIcon className="app-icon" /></button>
                  <button type="button" className="icon-button icon-button--danger" onClick={() => handleDiscardSession(session.id)} disabled={working}><DeleteIcon className="app-icon" /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel workflow-card">
        <div className="section-heading">
          <div><p className="eyebrow">{t('stepOne')}</p><h2>{t('chooseClientAndCase')}</h2></div>
          <button type="button" className="icon-button icon-button--accent" onClick={() => setShowNewClientForm((current) => !current)}>
            <PlusIcon className="app-icon" />
          </button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>{t('clientLabel')}</label>
            <select
              value={draftForm.clientId}
              onChange={(event) => setDraftForm((current) => ({ ...current, clientId: event.target.value, caseId: '' }))}
            >
              <option value="">{t('selectClient')}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} {isClientDraftReady(client) ? '' : `(${t('draftProfileIncomplete')})`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('linkedMatter')}</label>
            <select
              value={draftForm.caseId}
              onChange={(event) => {
                const selectedCase = cases.find((caseRecord) => caseRecord.id === event.target.value) || null;
                setDraftForm((current) => ({
                  ...current,
                  caseId: event.target.value,
                  clientId: findClientIdForCaseRecord(selectedCase, clients) || current.clientId,
                }));
              }}
            >
              <option value="">{t('standaloneDraft')}</option>
              {availableCases.map((caseRecord) => (
                <option key={caseRecord.id} value={caseRecord.id}>{caseRecord.case_number} - {caseRecord.client_name}</option>
              ))}
            </select>
          </div>
        </div>
        {activeClient && !isClientDraftReady(activeClient) ? (
          <p className="inline-feedback inline-feedback--error">
            {t('clientProfileIncompleteForDrafting')} <button type="button" className="text-link text-link--button" onClick={() => navigate(`/clients/${activeClient.id}?edit=1`)}>{t('openClientProfile')}</button>
          </p>
        ) : null}
        {showNewClientForm ? (
          <form onSubmit={handleCreateClient} className="top-space">
            <div className="form-grid">
              <div className="form-group"><label>{t('name')}</label><input type="text" value={clientForm.name} onChange={(event) => setClientForm((current) => ({ ...current, name: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('phone')}</label><input type="text" value={clientForm.phone} onChange={(event) => setClientForm((current) => ({ ...current, phone: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('email')}</label><input type="email" value={clientForm.email} onChange={(event) => setClientForm((current) => ({ ...current, email: event.target.value }))} /></div>
              <div className="form-group"><label>{t('preferredLanguage')}</label><select value={clientForm.preferredLanguage} onChange={(event) => setClientForm((current) => ({ ...current, preferredLanguage: event.target.value }))}><option value="en">{t('english')}</option><option value="hi">{t('hindi')}</option></select></div>
              <div className="form-group"><label>{t('relationLabel')}</label><select value={clientForm.relationLabel} onChange={(event) => setClientForm((current) => ({ ...current, relationLabel: event.target.value }))}>{relationLabelOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
              <div className="form-group"><label>{t('relationName')}</label><input type="text" value={clientForm.relationName} onChange={(event) => setClientForm((current) => ({ ...current, relationName: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('age')}</label><input type="number" value={clientForm.age} onChange={(event) => setClientForm((current) => ({ ...current, age: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('dateOfBirth')}</label><input type="date" value={clientForm.dateOfBirth} onChange={(event) => setClientForm((current) => ({ ...current, dateOfBirth: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('gender')}</label><select value={clientForm.gender} onChange={(event) => setClientForm((current) => ({ ...current, gender: event.target.value }))}>{genderOptions.map((option) => <option key={option} value={option}>{t(option.toLowerCase())}</option>)}</select></div>
              <div className="form-group full-span"><label>{t('address')}</label><textarea value={clientForm.address} onChange={(event) => setClientForm((current) => ({ ...current, address: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('aadhaarName')}</label><input type="text" value={clientForm.aadhaarName} onChange={(event) => setClientForm((current) => ({ ...current, aadhaarName: event.target.value }))} required /></div>
              <div className="form-group"><label>{t('aadhaarNumber')}</label><input type="text" value={clientForm.aadhaarNumber} onChange={(event) => setClientForm((current) => ({ ...current, aadhaarNumber: event.target.value }))} required /></div>
              <div className="form-group full-span"><label>{t('aadhaarReference')}</label><input type="file" accept="image/*,application/pdf" onChange={(event) => setAadhaarFile(event.target.files?.[0] || null)} /></div>
            </div>
            <button type="submit" className="button" disabled={working}>{t('addClientAndContinue')}</button>
          </form>
        ) : null}
      </section>

      <section className="panel workflow-card">
        <div className="section-heading">
          <div><p className="eyebrow">{t('stepTwo')}</p><h2>{t('uploadSourceDocumentsOptional')}</h2></div>
          <DocumentsIcon className="app-icon section-icon" />
        </div>
        <div className={`dropzone${working ? ' dropzone--disabled' : ''}`} {...getRootProps()}>
          <input {...getInputProps()} />
          <p>{t('draftingDropzoneTitle')}</p>
          <small>{t('optionalSourceUploadHint')}</small>
        </div>
        {selectedFiles.length ? (
          <div className="workflow-defaults top-space">
            {selectedFiles.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}
          </div>
        ) : null}
      </section>

      <section className="panel workflow-card">
        <div className="section-heading">
          <div><p className="eyebrow">{t('stepThree')}</p><h2>{t('advocateInstructions')}</h2></div>
        </div>
        <div className="form-group">
          <label>{t('draftInstructions')}</label>
          <textarea
            rows="6"
            value={draftForm.instructions}
            onChange={(event) => setDraftForm((current) => ({ ...current, instructions: event.target.value }))}
            placeholder={t('draftInstructionsPlaceholder')}
          />
        </div>
        <div className="button-row top-space">
          <button type="button" className="button" onClick={startDrafting} disabled={working}>{working ? t('generatingDraft') : t('generateDraft')}</button>
        </div>
      </section>

      {output ? (
        <section className="panel workflow-card">
          <div className="section-heading">
            <div><p className="eyebrow">{t('firstDraft')}</p><h2>{t('draftPreview')}</h2></div>
          </div>
          <div className="draft-preview">
            <strong>{activeClient?.name || t('generatedDraft')}</strong>
            <p>{(output.edited_text || output.generated_text || '').slice(0, 320)}...</p>
            <div className="button-row">
              <button type="button" className="button" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('view', output.fact_validation_required ? 'validate' : 'review'); return next; })}>
                {output.fact_validation_required ? t('validateKeyFacts') : t('openFullScreenReview')}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
};

export default DraftingAssistant;
