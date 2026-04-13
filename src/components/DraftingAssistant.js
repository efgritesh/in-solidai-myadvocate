import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import {
  ArrowRightIcon,
  CasesIcon,
  CopyIcon,
  DeleteIcon,
  DocumentsIcon,
  InfoIcon,
  PlusIcon,
} from './AppIcons';
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

const emptySetup = {
  caseId: '',
  draftType: 'legal_notice',
  customDraftType: '',
  outputLanguage: 'en',
  instructions: '',
};

const DraftingAssistant = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('sessionId') || '';
  const caseParam = searchParams.get('caseId') || '';

  const [setup, setSetup] = useState(emptySetup);
  const [loading, setLoading] = useState(true);
  const [savingSetup, setSavingSetup] = useState(false);
  const [working, setWorking] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [cases, setCases] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [sources, setSources] = useState([]);
  const [output, setOutput] = useState(null);
  const [typedText, setTypedText] = useState('');
  const [activeCase, setActiveCase] = useState(null);

  const loadSessionArtifacts = useCallback(async (sessionId, advocateId = auth.currentUser?.uid) => {
    if (!sessionId || !advocateId) {
      setSources([]);
      setOutput(null);
      return;
    }

    const [sourcesSnapshot, outputSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(db, 'drafting_sources'),
          where('session_id', '==', sessionId),
          where('advocate_id', '==', advocateId)
        )
      ),
      getDocs(
        query(
          collection(db, 'drafting_outputs'),
          where('session_id', '==', sessionId),
          where('advocate_id', '==', advocateId)
        )
      ),
    ]);

    const nextSources = sourcesSnapshot.docs
      .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
      .sort((left, right) => {
        const leftTime = left.created_at?.seconds || 0;
        const rightTime = right.created_at?.seconds || 0;
        return leftTime - rightTime;
      });
    const nextOutput = outputSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))[0] || null;

    setSources(nextSources);
    setOutput(nextOutput);
  }, []);

  const loadWorkspace = useCallback(async () => {
    const advocateId = auth.currentUser?.uid;
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

      const nextCases = casesSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      const nextSessions = sessionsSnapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .sort((left, right) => {
          const leftTime = left.updated_at?.seconds || left.created_at?.seconds || 0;
          const rightTime = right.updated_at?.seconds || right.created_at?.seconds || 0;
          return rightTime - leftTime;
        });

      setCases(nextCases);
      setSessions(nextSessions);

      let selectedSession = null;

      if (sessionParam) {
        selectedSession = nextSessions.find((session) => session.id === sessionParam) || null;
      }

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
          outputLanguage: selectedCase?.client_language || auth.currentUser?.languageCode || 'en',
          instructions: selectedCase
            ? `${t('draftingCasePrefillInstructions')} ${selectedCase.case_number}.`
            : '',
        });
      }
      setStatusMessage('');
    } catch (error) {
      setStatusMessage(error.message || t('unableToLoadDraftingWorkspace'));
      setSources([]);
      setOutput(null);
    } finally {
      setLoading(false);
    }
  }, [caseParam, loadSessionArtifacts, sessionParam, t]);

  const loadCaseDocuments = useCallback(async () => {
    const advocateId = auth.currentUser?.uid;
    const selectedCase = cases.find((caseRecord) => caseRecord.id === setup.caseId) || null;
    setActiveCase(selectedCase);

    if (!advocateId || !selectedCase?.case_number) {
      setExistingDocuments([]);
      return;
    }

    const documentsSnapshot = await getDocs(query(collection(db, 'documents'), where('advocate_id', '==', advocateId)));

    setExistingDocuments(
      documentsSnapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .filter((documentRecord) => documentRecord.case_id === selectedCase.case_number)
    );
  }, [cases, setup.caseId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    loadCaseDocuments();
  }, [loadCaseDocuments]);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === sessionParam) || null,
    [sessionParam, sessions]
  );

  const pendingSources = useMemo(
    () => sources.filter((source) => source.status === 'pending' || source.status === 'failed'),
    [sources]
  );

  const readySources = useMemo(
    () => sources.filter((source) => (source.reviewed_text || source.raw_extracted_text || '').trim().length > 0),
    [sources]
  );

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
      await loadWorkspace();
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
      if (setup.caseId) {
        next.set('caseId', setup.caseId);
      }
      return next;
    });
    return created.sessionId;
  }, [cases, loadWorkspace, sessionParam, setSearchParams, setup]);

  const handleSaveSetup = async () => {
    setSavingSetup(true);
    setStatusMessage('');
    try {
      await ensureSession();
      setStatusMessage(t('draftingSetupSaved'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setSavingSetup(false);
    }
  };

  const handleAddTypedText = async () => {
    if (!typedText.trim()) {
      setStatusMessage(t('draftingTypedTextRequired'));
      return;
    }

    setWorking(true);
    setStatusMessage('');
    try {
      const sessionId = await ensureSession();
      await registerDraftingSource({
        sessionId,
        sourceType: 'typed_text',
        typedText,
        label: t('typedNotes'),
        name: t('typedNotes'),
      });
      setTypedText('');
      await loadSessionArtifacts(sessionId);
      setStatusMessage(t('draftingSourceAdded'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) {
      return;
    }

    setWorking(true);
    setStatusMessage('');
    try {
      const sessionId = await ensureSession();
      const advocateId = auth.currentUser?.uid;

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

      await loadSessionArtifacts(sessionId);
      setStatusMessage(t('draftingSourceAdded'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  }, [ensureSession, loadSessionArtifacts, t]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleAttachExistingDocument = async (documentId) => {
    setWorking(true);
    setStatusMessage('');
    try {
      const sessionId = await ensureSession();
      await registerDraftingSource({
        sessionId,
        sourceType: 'existing_document',
        existingDocumentId: documentId,
      });
      await loadSessionArtifacts(sessionId);
      setStatusMessage(t('draftingSourceAdded'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleExtract = async () => {
    setWorking(true);
    setStatusMessage('');
    try {
      await extractDraftingSources({
        sessionId: sessionParam,
        sourceIds: pendingSources.map((source) => source.id),
      });
      await loadSessionArtifacts(sessionParam);
      await loadWorkspace();
      setStatusMessage(t('draftingExtractionComplete'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleSourceTextChange = (sourceId, reviewedText) => {
    setSources((current) =>
      current.map((source) => (source.id === sourceId ? { ...source, reviewed_text: reviewedText } : source))
    );
  };

  const persistSourceText = async (sourceId, reviewedText) => {
    await updateDoc(doc(db, 'drafting_sources', sourceId), {
      reviewed_text: reviewedText,
      updated_at: new Date(),
    });
  };

  const handleRemoveSource = async (sourceId) => {
    setWorking(true);
    try {
      await deleteDoc(doc(db, 'drafting_sources', sourceId));
      if (sessionParam) {
        await updateDoc(doc(db, 'drafting_sessions', sessionParam), {
          source_count: Math.max(0, sources.length - 1),
          updated_at: new Date(),
        });
      }
      await loadSessionArtifacts(sessionParam);
    } finally {
      setWorking(false);
    }
  };

  const handleGenerate = async () => {
    setWorking(true);
    setStatusMessage('');
    try {
      const sessionId = await ensureSession();
      await Promise.all(
        sources.map((source) =>
          updateDoc(doc(db, 'drafting_sources', source.id), {
            reviewed_text: source.reviewed_text || source.raw_extracted_text || '',
            updated_at: new Date(),
          })
        )
      );
      await generateDraftingOutput({ sessionId });
      await loadSessionArtifacts(sessionId);
      await loadWorkspace();
      setStatusMessage(t('draftingGenerationComplete'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleSaveDraftEdits = async () => {
    if (!output?.id) {
      return;
    }

    setWorking(true);
    setStatusMessage('');
    try {
      await updateDoc(doc(db, 'drafting_outputs', output.id), {
        edited_text: output.edited_text,
        updated_at: new Date(),
      });
      setStatusMessage(t('draftingDraftSaved'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!output?.edited_text) {
      return;
    }
    await navigator.clipboard.writeText(output.edited_text);
    setStatusMessage(t('draftingCopied'));
  };

  const handleExport = async () => {
    if (!output?.id) {
      return;
    }

    setWorking(true);
    setStatusMessage('');
    try {
      const exportResult = await exportDraftingDocx({
        sessionId: sessionParam,
        outputId: output.id,
      });
      const exportUrl = await getStorageUrl(exportResult.exportPath);
      window.open(exportUrl, '_blank', 'noopener,noreferrer');
      await loadSessionArtifacts(sessionParam);
      setStatusMessage(t('draftingExportReady'));
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const handlePublish = async () => {
    if (!output?.id) {
      return;
    }

    setWorking(true);
    setStatusMessage('');
    try {
      await publishDraftingOutput({
        sessionId: sessionParam,
        outputId: output.id,
      });
      await loadSessionArtifacts(sessionParam);
      setStatusMessage(t('draftingPublishComplete'));
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
      return next;
    });
  };

  if (loading) {
    return (
      <PageShell title={t('aiDraftingAssistant')} subtitle={t('aiDraftingSubtitle')} showBack>
        <LoadingState label={t('loadingDraftingWorkspace')} />
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
          {activeCase ? (
            <button
              type="button"
              className="icon-button"
              title={t('openCaseDetails')}
              aria-label={t('openCaseDetails')}
              onClick={() => navigate(`/cases/${activeCase.id}`)}
            >
              <CasesIcon className="app-icon" />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            title={t('saveSetup')}
            aria-label={t('saveSetup')}
            onClick={handleSaveSetup}
            disabled={savingSetup}
          >
            <PlusIcon className="app-icon" />
          </button>
        </div>
      }
    >
      <section className="panel panel--accent">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('importantNotice')}</p>
            <h2>{t('aiDraftingDisclaimerTitle')}</h2>
          </div>
          <InfoIcon className="app-icon section-icon" />
        </div>
        <p className="supporting-copy">{t('aiDraftingDisclaimerBody')}</p>
        {savingSetup || working ? (
          <LoadingState
            compact
            label={savingSetup ? t('saving') : output ? t('processingDraftingRequest') : t('processing')}
          />
        ) : null}
        {statusMessage ? <p className="inline-feedback">{statusMessage}</p> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('draftSetup')}</p>
            <h2>{t('configureDraft')}</h2>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>{t('linkedMatter')}</label>
            <select
              value={setup.caseId}
              onChange={(event) => setSetup((current) => ({ ...current, caseId: event.target.value }))}
            >
              <option value="">{t('standaloneDraft')}</option>
              {cases.map((caseRecord) => (
                <option key={caseRecord.id} value={caseRecord.id}>
                  {caseRecord.case_number} - {caseRecord.client_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('draftType')}</label>
            <select
              value={setup.draftType}
              onChange={(event) => setSetup((current) => ({ ...current, draftType: event.target.value }))}
            >
              {draftingTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {setup.draftType === 'custom' ? (
            <div className="form-group">
              <label>{t('customDraftType')}</label>
              <input
                type="text"
                value={setup.customDraftType}
                onChange={(event) => setSetup((current) => ({ ...current, customDraftType: event.target.value }))}
                placeholder={t('customDraftTypePlaceholder')}
              />
            </div>
          ) : null}
          <div className="form-group">
            <label>{t('outputLanguage')}</label>
            <select
              value={setup.outputLanguage}
              onChange={(event) => setSetup((current) => ({ ...current, outputLanguage: event.target.value }))}
            >
              <option value="en">{t('english')}</option>
              <option value="hi">{t('hindi')}</option>
            </select>
          </div>
          <div className="form-group full-span">
            <label>{t('draftInstructions')}</label>
            <textarea
              rows="4"
              value={setup.instructions}
              onChange={(event) => setSetup((current) => ({ ...current, instructions: event.target.value }))}
              placeholder={t('draftInstructionsPlaceholder')}
            />
          </div>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={handleSaveSetup} disabled={savingSetup}>
            {savingSetup ? t('saving') : currentSession ? t('saveSetup') : t('startDraftWorkspace')}
          </button>
          {currentSession ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => openSession(currentSession.id)}
            >
              {t('activeSession')}
            </button>
          ) : null}
        </div>
        {sessions.length ? (
          <div className="record-list top-space">
            {sessions.slice(0, 4).map((session) => (
              <article key={session.id} className="record-item record-item--interactive" onClick={() => openSession(session.id)}>
                <div>
                  <strong>{session.custom_draft_type || session.draft_type}</strong>
                  <p>{session.case_number || t('standaloneDraft')} | {session.status}</p>
                </div>
                <ArrowRightIcon className="app-icon" />
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('sources')}</p>
            <h2>{t('attachDraftingSources')}</h2>
          </div>
          <DocumentsIcon className="app-icon section-icon" />
        </div>
        <div className="dropzone" {...getRootProps()}>
          <input {...getInputProps()} />
          <p>{t('draftingDropzoneTitle')}</p>
          <small>{t('draftingDropzoneSubtitle')}</small>
        </div>
        <div className="form-group top-space">
          <label>{t('pasteFactsOrNotes')}</label>
          <textarea
            rows="5"
            value={typedText}
            onChange={(event) => setTypedText(event.target.value)}
            placeholder={t('typedNotesPlaceholder')}
          />
        </div>
        <div className="button-row">
          <button type="button" className="button button--secondary" onClick={handleAddTypedText} disabled={working}>
            {t('addTypedNotes')}
          </button>
          <button
            type="button"
            className="button"
            onClick={handleExtract}
            disabled={!sessionParam || !pendingSources.length || working}
          >
            {working ? t('processing') : t('extractReviewText')}
          </button>
        </div>
        {existingDocuments.length ? (
          <div className="record-list top-space">
            {existingDocuments.map((documentRecord) => (
              <article key={documentRecord.id} className="record-item">
                <div>
                  <strong>{documentRecord.name}</strong>
                  <p>{documentRecord.type || t('generalFile')}</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title={t('useAsSource')}
                  aria-label={t('useAsSource')}
                  onClick={() => handleAttachExistingDocument(documentRecord.id)}
                >
                  <PlusIcon className="app-icon" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state top-space">{t('draftingNoExistingDocuments')}</p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('review')}</p>
            <h2>{t('reviewExtractedText')}</h2>
          </div>
        </div>
        {sources.length === 0 ? (
          <p className="empty-state">{t('draftingNoSources')}</p>
        ) : (
          <div className="record-list">
            {sources.map((source) => (
              <article key={source.id} className="record-card record-card--drafting">
                <div className="record-item">
                  <div>
                    <strong>{source.name || source.label || t('untitledSource')}</strong>
                    <p>{source.extraction_method || source.source_type} | {source.status}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('removeSource')}
                    aria-label={t('removeSource')}
                    onClick={() => handleRemoveSource(source.id)}
                  >
                    <DeleteIcon className="app-icon" />
                  </button>
                </div>
                <textarea
                  rows="7"
                  value={source.reviewed_text || source.raw_extracted_text || ''}
                  onChange={(event) => handleSourceTextChange(source.id, event.target.value)}
                  onBlur={(event) => persistSourceText(source.id, event.target.value)}
                  placeholder={t('reviewedTextPlaceholder')}
                />
                {source.error_message ? <p className="inline-feedback inline-feedback--error">{source.error_message}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('generatedDraft')}</p>
            <h2>{t('firstDraft')}</h2>
          </div>
        </div>
        {!output ? (
          <div className="empty-state-block">
            <p className="empty-state">{t('draftingNoOutput')}</p>
            <button
              type="button"
              className="button"
              onClick={handleGenerate}
              disabled={!sessionParam || !readySources.length || working}
            >
              {working ? t('generatingDraft') : t('generateDraft')}
            </button>
          </div>
        ) : (
          <>
            <textarea
              rows="16"
              value={output.edited_text || output.generated_text || ''}
              onChange={(event) => setOutput((current) => ({ ...current, edited_text: event.target.value }))}
            />
            <div className="button-row top-space">
              <button type="button" className="button" onClick={handleSaveDraftEdits} disabled={working}>
                {t('saveDraft')}
              </button>
              <button type="button" className="button button--secondary" onClick={handleCopy}>
                <CopyIcon className="app-icon" />
                <span>{t('copyText')}</span>
              </button>
              <button type="button" className="button button--secondary" onClick={handleExport} disabled={working}>
                {t('exportDocx')}
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={handlePublish}
                disabled={working || !setup.caseId}
              >
                {t('publishToCaseDocuments')}
              </button>
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
};

export default DraftingAssistant;
