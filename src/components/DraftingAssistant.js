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
  draftingTypeOptions,
  exportDraftingDocx,
  extractDraftingSources,
  generateDraftingOutput,
  getStorageUrl,
  publishDraftingOutput,
  registerDraftingSource,
  uploadDraftingFile,
} from '../utils/drafting';

const emptySetup = { caseId: '', draftType: 'legal_notice', customDraftType: '', outputLanguage: 'en', instructions: '' };
const workflowLabels = {
  draft: 'Ready to start',
  extracting: 'Reading source files',
  ready_for_review: 'Review source text',
  generating: 'Preparing first draft',
  completed: 'Draft ready',
  failed: 'Needs attention',
};

const DraftingAssistant = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId') || '';
  const caseParam = searchParams.get('caseId') || '';
  const reviewMode = searchParams.get('view') === 'review';
  const advocateId = auth.currentUser?.uid || '';

  const [setup, setSetup] = useState(emptySetup);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [cases, setCases] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [sources, setSources] = useState([]);
  const [output, setOutput] = useState(null);
  const [typedText, setTypedText] = useState('');
  const [activeCase, setActiveCase] = useState(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showSourceReview, setShowSourceReview] = useState(false);

  const draftTypeLabel = useCallback((draftType, customDraftType) => {
    if (draftType === 'custom') return customDraftType?.trim() || 'Custom draft';
    return draftingTypeOptions.find((option) => option.value === draftType)?.label || 'Legal draft';
  }, []);

  const fetchSessionArtifacts = useCallback(async (sessionId, ownerId = auth.currentUser?.uid) => {
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

  const loadSessionArtifacts = useCallback(async (sessionId, ownerId = auth.currentUser?.uid) => {
    const { nextSources, nextOutput } = await fetchSessionArtifacts(sessionId, ownerId);
    setSources(nextSources);
    setOutput(nextOutput);
    return { nextSources, nextOutput };
  }, [fetchSessionArtifacts]);

  const clearSessionParams = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('sessionId');
      next.delete('view');
      return next;
    });
  }, [setSearchParams]);

  const loadWorkspace = useCallback(async () => {
    if (!advocateId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [casesSnapshot, sessionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'drafting_sessions'), where('advocate_id', '==', advocateId))),
      ]);
      const nextCases = casesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const nextSessions = sessionsSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((left, right) => (right.updated_at?.seconds || 0) - (left.updated_at?.seconds || 0));
      setCases(nextCases);
      setSessions(nextSessions);

      const selectedSession = sessionParam ? nextSessions.find((session) => session.id === sessionParam) || null : null;
      const selectedCase = nextCases.find((caseRecord) => caseRecord.id === (selectedSession?.case_id || caseParam)) || null;
      setActiveCase(selectedCase);

      if (selectedSession) {
        setSetup({
          caseId: selectedSession.case_id || '',
          draftType: selectedSession.draft_type || 'legal_notice',
          customDraftType: selectedSession.custom_draft_type || '',
          outputLanguage: selectedSession.output_language || selectedCase?.client_language || 'en',
          instructions: selectedSession.instructions || '',
        });
        await loadSessionArtifacts(selectedSession.id, advocateId);
      } else {
        setSources([]);
        setOutput(null);
        setSetup({
          caseId: selectedCase?.id || '',
          draftType: 'legal_notice',
          customDraftType: '',
          outputLanguage: selectedCase?.client_language || 'en',
          instructions: selectedCase ? `${t('draftingCasePrefillInstructions')} ${selectedCase.case_number}.` : '',
        });
      }
      setStatusMessage('');
    } catch (error) {
      setStatusMessage(error.message || 'Unable to load the drafting workflow right now.');
    } finally {
      setLoading(false);
    }
  }, [advocateId, caseParam, loadSessionArtifacts, sessionParam, t]);

  const loadCaseDocuments = useCallback(async () => {
    const selectedCase = cases.find((caseRecord) => caseRecord.id === setup.caseId) || null;
    setActiveCase(selectedCase);
    if (!advocateId || !selectedCase?.case_number) {
      setExistingDocuments([]);
      return;
    }
    const docsSnapshot = await getDocs(query(collection(db, 'documents'), where('advocate_id', '==', advocateId)));
    setExistingDocuments(docsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.case_id === selectedCase.case_number));
  }, [advocateId, cases, setup.caseId]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { loadCaseDocuments(); }, [loadCaseDocuments]);

  const currentSession = useMemo(() => sessions.find((session) => session.id === sessionParam) || null, [sessionParam, sessions]);
  const readySources = useMemo(() => sources.filter((source) => (source.reviewed_text || source.raw_extracted_text || '').trim()), [sources]);
  const currentWorkflowLabel = workflowLabels[currentSession?.status] || 'Draft workflow';

  const ensureSession = useCallback(async () => {
    const selectedCase = cases.find((caseRecord) => caseRecord.id === setup.caseId) || null;
    if (sessionParam) {
      await updateDoc(doc(db, 'drafting_sessions', sessionParam), {
        case_id: setup.caseId || '',
        case_number: selectedCase?.case_number || '',
        client_name: selectedCase?.client_name || '',
        draft_type: setup.draftType,
        custom_draft_type: setup.customDraftType,
        output_language: setup.outputLanguage,
        instructions: setup.instructions,
        updated_at: new Date(),
      });
      return sessionParam;
    }
    const created = await createDraftingSession({
      caseId: setup.caseId || '',
      draftType: setup.draftType,
      customDraftType: setup.customDraftType,
      outputLanguage: setup.outputLanguage,
      instructions: setup.instructions,
    });
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('sessionId', created.sessionId);
      if (setup.caseId) next.set('caseId', setup.caseId);
      return next;
    });
    return created.sessionId;
  }, [cases, sessionParam, setSearchParams, setup]);

  const runAutomaticPipeline = useCallback(async (sessionId) => {
    await extractDraftingSources({ sessionId });
    const { nextSources } = await loadSessionArtifacts(sessionId, advocateId);
    if (!nextSources.some((source) => (source.reviewed_text || source.raw_extracted_text || '').trim())) {
      setShowSourceReview(true);
      setStatusMessage('The source was uploaded, but the extracted text needs review before a draft can be prepared.');
      return;
    }
    await generateDraftingOutput({ sessionId });
    await loadWorkspace();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('sessionId', sessionId);
      next.set('view', 'review');
      return next;
    });
    setStatusMessage(t('draftingGenerationComplete'));
  }, [advocateId, loadSessionArtifacts, loadWorkspace, setSearchParams, t]);

  const applyAssumptions = async () => {
    setWorking(true);
    setStatusMessage('');
    try {
      await ensureSession();
      await loadWorkspace();
      setStatusMessage(currentSession ? t('draftingSetupSaved') : 'Default assumptions are ready.');
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleAddTypedText = async () => {
    if (!typedText.trim()) {
      setStatusMessage(t('draftingTypedTextRequired'));
      return;
    }
    setWorking(true);
    setStatusMessage('Preparing your draft from typed notes.');
    try {
      const sessionId = await ensureSession();
      await registerDraftingSource({ sessionId, sourceType: 'typed_text', typedText, label: t('typedNotes'), name: t('typedNotes') });
      setTypedText('');
      await runAutomaticPipeline(sessionId);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setWorking(true);
    setStatusMessage('Uploading and preparing your draft.');
    try {
      const sessionId = await ensureSession();
      for (const file of acceptedFiles) {
        const upload = await uploadDraftingFile({ advocateId, sessionId, file });
        await registerDraftingSource({
          sessionId,
          sourceType: 'uploaded_file',
          name: file.name,
          label: file.name,
          mimeType: file.type || 'application/octet-stream',
          storagePath: upload.storagePath,
          url: upload.url,
        });
      }
      await runAutomaticPipeline(sessionId);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  }, [advocateId, ensureSession, runAutomaticPipeline]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop, disabled: working });

  const handleAttachExistingDocument = async (documentId) => {
    setWorking(true);
    setStatusMessage('Using the selected case document as a drafting source.');
    try {
      const sessionId = await ensureSession();
      await registerDraftingSource({ sessionId, sourceType: 'existing_document', existingDocumentId: documentId });
      await runAutomaticPipeline(sessionId);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleSourceTextChange = (sourceId, reviewedText) => {
    setSources((current) => current.map((source) => (source.id === sourceId ? { ...source, reviewed_text: reviewedText } : source)));
  };

  const persistSourceText = async (sourceId, reviewedText) => {
    await updateDoc(doc(db, 'drafting_sources', sourceId), { reviewed_text: reviewedText, updated_at: new Date() });
  };

  const handleRemoveSource = async (sourceId) => {
    setWorking(true);
    try {
      await deleteDoc(doc(db, 'drafting_sources', sourceId));
      await loadSessionArtifacts(sessionParam, advocateId);
      setStatusMessage('Drafting source removed.');
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleRegenerate = async () => {
    if (!sessionParam) return;
    setWorking(true);
    setStatusMessage('Regenerating the draft.');
    try {
      await Promise.all(sources.map((source) => updateDoc(doc(db, 'drafting_sources', source.id), {
        reviewed_text: source.reviewed_text || source.raw_extracted_text || '',
        updated_at: new Date(),
      })));
      await generateDraftingOutput({ sessionId: sessionParam });
      await loadWorkspace();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('view', 'review');
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
    if (!output?.id) return;
    setWorking(true);
    try {
      const exportResult = await exportDraftingDocx({ sessionId: sessionParam, outputId: output.id });
      const exportUrl = await getStorageUrl(exportResult.exportPath);
      window.open(exportUrl, '_blank', 'noopener,noreferrer');
      await loadSessionArtifacts(sessionParam, advocateId);
      setStatusMessage(t('draftingExportReady'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handlePublish = async () => {
    if (!output?.id) return;
    setWorking(true);
    try {
      await publishDraftingOutput({ sessionId: sessionParam, outputId: output.id });
      await loadSessionArtifacts(sessionParam, advocateId);
      setStatusMessage(t('draftingPublishComplete'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
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
        setSetup(emptySetup);
        setSources([]);
        setOutput(null);
      }
      await loadWorkspace();
      setStatusMessage('Drafting workflow discarded.');
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

  if (loading) {
    return <PageShell title={t('aiDraftingAssistant')} subtitle={t('aiDraftingSubtitle')} showBack><LoadingState label={t('loadingDraftingWorkspace')} /></PageShell>;
  }

  if (reviewMode && output) {
    return (
      <PageShell
        title={draftTypeLabel(setup.draftType, setup.customDraftType)}
        subtitle={activeCase ? `${activeCase.case_number} | ${activeCase.client_name}` : t('aiDraftingSubtitle')}
        showBack
        actions={<div className="header-icon-group"><button type="button" className="icon-button" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('view'); return next; })}><ArrowRightIcon className="app-icon" /></button></div>}
      >
        <section className="panel draft-review-shell">
          <div className="section-heading">
            <div><p className="eyebrow">{currentWorkflowLabel}</p><h2>{t('firstDraft')}</h2></div>
            {activeCase ? <button type="button" className="icon-button" onClick={() => navigate(`/cases/${activeCase.id}`)}><CasesIcon className="app-icon" /></button> : null}
          </div>
          <textarea className="draft-review-shell__editor" rows="22" value={output.edited_text || output.generated_text || ''} onChange={(event) => setOutput((current) => ({ ...current, edited_text: event.target.value }))} />
          <div className="button-row top-space">
            <button type="button" className="button" onClick={handleSaveDraftEdits} disabled={working}>{t('saveDraft')}</button>
            <button type="button" className="button button--secondary" onClick={handleCopy}><CopyIcon className="app-icon" /><span>{t('copyText')}</span></button>
            <button type="button" className="button button--secondary" onClick={handleExport} disabled={working}>{t('exportDocx')}</button>
            <button type="button" className="button button--secondary" onClick={handlePublish} disabled={working || !setup.caseId}>{t('publishToCaseDocuments')}</button>
            <button type="button" className="button button--secondary" onClick={handleRegenerate} disabled={working}>{t('generateDraft')}</button>
          </div>
          {statusMessage ? <p className="inline-feedback">{statusMessage}</p> : null}
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t('aiDraftingAssistant')}
      subtitle={t('aiDraftingSubtitle')}
      showBack
      actions={
        <div className="header-icon-group">
          {activeCase ? <button type="button" className="icon-button" onClick={() => navigate(`/cases/${activeCase.id}`)}><CasesIcon className="app-icon" /></button> : null}
          {currentSession ? <button type="button" className="icon-button icon-button--danger" onClick={() => handleDiscardSession(currentSession.id)} disabled={working}><DeleteIcon className="app-icon" /></button> : null}
        </div>
      }
    >
      <section className="panel panel--accent workflow-card">
        <div className="section-heading">
          <div><p className="eyebrow">{currentSession ? 'Resume workflow' : 'Start workflow'}</p><h2>{currentSession ? currentWorkflowLabel : 'Single-flow drafting'}</h2></div>
          <InfoIcon className="app-icon section-icon" />
        </div>
        <div className="workflow-summary">
          <div className="workflow-summary__main">
            <strong>{currentSession ? draftTypeLabel(currentSession.draft_type, currentSession.custom_draft_type) : 'Default assumptions are ready'}</strong>
            <p>{activeCase ? `${activeCase.case_number} | ${activeCase.client_name}` : 'Upload once and iAdvocate will extract text and prepare the first draft automatically.'}</p>
          </div>
          <div className="workflow-summary__meta"><span className="badge">{currentSession ? currentWorkflowLabel : 'Waiting for source'}</span></div>
        </div>
        {working ? <LoadingState compact label={statusMessage || 'Working on your draft.'} /> : statusMessage ? <p className="inline-feedback">{statusMessage}</p> : null}
      </section>

      {sessions.length ? (
        <section className="panel workflow-card">
          <div className="section-heading"><div><p className="eyebrow">Saved workflows</p><h2>Resume or discard</h2></div></div>
          <div className="record-list">
            {sessions.slice(0, 5).map((session) => (
              <article key={session.id} className="record-item">
                <button type="button" className="workflow-session" onClick={() => openSession(session.id)}>
                  <strong>{draftTypeLabel(session.draft_type, session.custom_draft_type)}</strong>
                  <p>{session.case_number || 'Standalone draft'} | {workflowLabels[session.status] || session.status}</p>
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
          <div><p className="eyebrow">Assumptions</p><h2>Use defaults or adjust</h2></div>
          <button type="button" className="icon-button" onClick={() => setShowAssumptions((current) => !current)}><PlusIcon className="app-icon" /></button>
        </div>
        <div className="workflow-defaults">
          <span>{draftTypeLabel(setup.draftType, setup.customDraftType)}</span>
          <span>{setup.outputLanguage === 'hi' ? t('hindi') : t('english')}</span>
          <span>{activeCase ? activeCase.case_number : 'Standalone matter'}</span>
        </div>
        {showAssumptions ? (
          <>
            <div className="form-grid top-space">
              <div className="form-group"><label>{t('linkedMatter')}</label><select value={setup.caseId} onChange={(event) => setSetup((current) => ({ ...current, caseId: event.target.value }))}><option value="">{t('standaloneDraft')}</option>{cases.map((caseRecord) => <option key={caseRecord.id} value={caseRecord.id}>{caseRecord.case_number} - {caseRecord.client_name}</option>)}</select></div>
              <div className="form-group"><label>{t('draftType')}</label><select value={setup.draftType} onChange={(event) => setSetup((current) => ({ ...current, draftType: event.target.value }))}>{draftingTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              {setup.draftType === 'custom' ? <div className="form-group"><label>{t('customDraftType')}</label><input type="text" value={setup.customDraftType} onChange={(event) => setSetup((current) => ({ ...current, customDraftType: event.target.value }))} placeholder={t('customDraftTypePlaceholder')} /></div> : null}
              <div className="form-group"><label>{t('outputLanguage')}</label><select value={setup.outputLanguage} onChange={(event) => setSetup((current) => ({ ...current, outputLanguage: event.target.value }))}><option value="en">{t('english')}</option><option value="hi">{t('hindi')}</option></select></div>
              <div className="form-group full-span"><label>{t('draftInstructions')}</label><textarea rows="4" value={setup.instructions} onChange={(event) => setSetup((current) => ({ ...current, instructions: event.target.value }))} placeholder={t('draftInstructionsPlaceholder')} /></div>
            </div>
            <div className="button-row"><button type="button" className="button button--secondary" onClick={applyAssumptions} disabled={working}>{currentSession ? t('saveSetup') : 'Apply defaults'}</button></div>
          </>
        ) : null}
      </section>

      <section className="panel workflow-card">
        <div className="section-heading"><div><p className="eyebrow">Step 1</p><h2>Upload once</h2></div><DocumentsIcon className="app-icon section-icon" /></div>
        <div className={`dropzone${working ? ' dropzone--disabled' : ''}`} {...getRootProps()}>
          <input {...getInputProps()} />
          <p>{t('draftingDropzoneTitle')}</p>
          <small>Upload a file and iAdvocate will extract text and prepare a first draft automatically.</small>
        </div>
        <div className="form-group top-space"><label>{t('pasteFactsOrNotes')}</label><textarea rows="5" value={typedText} onChange={(event) => setTypedText(event.target.value)} placeholder={t('typedNotesPlaceholder')} /></div>
        <div className="button-row"><button type="button" className="button button--secondary" onClick={handleAddTypedText} disabled={working}>{t('addTypedNotes')}</button></div>
        {existingDocuments.length ? <div className="record-list top-space">{existingDocuments.map((documentRecord) => <article key={documentRecord.id} className="record-item"><div><strong>{documentRecord.name}</strong><p>{documentRecord.type || t('generalFile')}</p></div><button type="button" className="icon-button" onClick={() => handleAttachExistingDocument(documentRecord.id)} disabled={working}><PlusIcon className="app-icon" /></button></article>)}</div> : null}
      </section>

      {sources.length ? (
        <section className="panel workflow-card">
          <div className="section-heading">
            <div><p className="eyebrow">Step 2</p><h2>Review source text only if needed</h2></div>
            <button type="button" className="icon-button" onClick={() => setShowSourceReview((current) => !current)}><PlusIcon className="app-icon" /></button>
          </div>
          <div className="workflow-defaults">{sources.map((source) => <span key={source.id}>{source.name || source.label || t('untitledSource')}</span>)}</div>
          {showSourceReview ? <div className="record-list top-space">{sources.map((source) => <article key={source.id} className="record-card record-card--drafting"><div className="record-item"><div><strong>{source.name || source.label || t('untitledSource')}</strong><p>{source.extraction_method || source.source_type} | {source.status}</p></div><button type="button" className="icon-button" onClick={() => handleRemoveSource(source.id)}><DeleteIcon className="app-icon" /></button></div><textarea rows="7" value={source.reviewed_text || source.raw_extracted_text || ''} onChange={(event) => handleSourceTextChange(source.id, event.target.value)} onBlur={(event) => persistSourceText(source.id, event.target.value)} placeholder={t('reviewedTextPlaceholder')} />{source.error_message ? <p className="inline-feedback inline-feedback--error">{source.error_message}</p> : null}</article>)}
            <div className="button-row"><button type="button" className="button" onClick={handleRegenerate} disabled={!readySources.length || working}>{t('generateDraft')}</button></div>
          </div> : null}
        </section>
      ) : null}

      <section className="panel workflow-card">
        <div className="section-heading"><div><p className="eyebrow">Step 3</p><h2>Open the draft full screen</h2></div></div>
        {!output ? <div className="empty-state-block"><p className="empty-state">{t('draftingNoOutput')}</p><button type="button" className="button" onClick={handleRegenerate} disabled={!sessionParam || !readySources.length || working}>{working ? t('generatingDraft') : t('generateDraft')}</button></div> : (
          <div className="draft-preview">
            <strong>{draftTypeLabel(setup.draftType, setup.customDraftType)}</strong>
            <p>{(output.edited_text || output.generated_text || '').slice(0, 320)}...</p>
            <div className="button-row">
              <button type="button" className="button" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('view', 'review'); return next; })}>Open full-screen review</button>
              <button type="button" className="button button--secondary" onClick={handleRegenerate} disabled={working}>Regenerate</button>
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default DraftingAssistant;
