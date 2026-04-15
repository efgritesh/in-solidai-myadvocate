import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon, CloseIcon, PlusIcon } from './AppIcons';
import { calculateAgeFromDateOfBirth, createClientProfile, extractAadhaarDetails } from '../utils/clientProfiles';
import {
  buildClientDraftingSummary,
  genderOptions,
  isClientDraftReady,
  relationLabelOptions,
} from '../utils/draftingProfiles';
import useAiAccessSummary from '../utils/useAiAccessSummary';
import { canUseAiNow, getAiCreditHeadline } from '../utils/billing';

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

const emptyAadhaarStatus = { loading: false, success: false, warnings: [], rawText: '', error: '' };

const Clients = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyClientForm);
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [intakeMode, setIntakeMode] = useState('aadhaar');
  const [aadhaarStatus, setAadhaarStatus] = useState(emptyAadhaarStatus);
  const [showAiAccessModal, setShowAiAccessModal] = useState(false);
  const advocateId = auth.currentUser?.uid || '';
  const { summary: aiSummary } = useAiAccessSummary();
  const aadhaarInputRef = useRef(null);
  const aadhaarReviewInputRef = useRef(null);

  const updateField = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'dateOfBirth' && !current.age) {
        next.age = calculateAgeFromDateOfBirth(value);
      }
      return next;
    });
  };

  const resetComposer = useCallback(() => {
    setForm(emptyClientForm);
    setAadhaarFile(null);
    setAadhaarStatus(emptyAadhaarStatus);
    setIntakeMode('aadhaar');
  }, []);

  const fetchClients = useCallback(async () => {
    if (!advocateId) {
      setLoading(false);
      return;
    }
    try {
      const querySnapshot = await getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId)));
      setClients(querySnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    } finally {
      setLoading(false);
    }
  }, [advocateId]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const readyStats = useMemo(() => {
    const readyCount = clients.filter((client) => isClientDraftReady(client)).length;
    return { readyCount, totalCount: clients.length };
  }, [clients]);

  const shouldShowManualForm = intakeMode === 'manual' || aadhaarStatus.success || Boolean(aadhaarStatus.error) || Boolean(aadhaarStatus.rawText);
  const aiLocked = aiSummary && !canUseAiNow(aiSummary);

  const handleAddClient = async (event) => {
    event.preventDefault();
    if (!advocateId) return;

    setSaving(true);
    try {
      await createClientProfile({
        advocateId,
        data: {
          advocate_id: advocateId,
          ...form,
          age: form.age || calculateAgeFromDateOfBirth(form.dateOfBirth),
          draftReady: true,
        },
        aadhaarFile,
      });

      resetComposer();
      setShowAddClientForm(false);
      await fetchClients();
    } finally {
      setSaving(false);
    }
  };

  const applyAadhaarFields = (extracted = {}) => {
    setForm((current) => {
      const resolvedDob = extracted.dateOfBirth || current.dateOfBirth || '';
      const resolvedAge = extracted.age || current.age || calculateAgeFromDateOfBirth(resolvedDob);
      return {
        ...current,
        name: current.name || extracted.name || extracted.aadhaarName || '',
        aadhaarName: extracted.aadhaarName || current.aadhaarName || '',
        aadhaarNumber: extracted.aadhaarNumber || current.aadhaarNumber || '',
        dateOfBirth: resolvedDob,
        age: resolvedAge,
        gender: extracted.gender || current.gender || '',
        address: extracted.address || current.address || '',
      };
    });
  };

  const handleAadhaarUpload = async (file) => {
    setAadhaarFile(file || null);
    if (!file || !advocateId) {
      setAadhaarStatus(emptyAadhaarStatus);
      return;
    }

    setAadhaarStatus({ loading: true, success: false, warnings: [], rawText: '', error: '' });
    try {
      const result = await extractAadhaarDetails({ advocateId, file });
      applyAadhaarFields(result.extracted);
      setAadhaarStatus({
        loading: false,
        success: result.success,
        warnings: result.warnings || [],
        rawText: result.extracted?.rawText || '',
        error: '',
      });
    } catch (error) {
      if (/trial|subscribe|top up|credits/i.test(error.message || '')) {
        navigate('/premium?feature=aadhaar_ocr');
      }
      setAadhaarStatus({
        loading: false,
        success: false,
        warnings: [],
        rawText: '',
        error: error.message || t('aadhaarReadFailed'),
      });
    }
  };

  const requestAadhaarUpload = (target = 'primary') => {
    if (aiLocked) {
      setShowAiAccessModal(true);
      return;
    }

    if (target === 'review') {
      aadhaarReviewInputRef.current?.click();
      return;
    }

    aadhaarInputRef.current?.click();
  };

  const toggleComposer = () => {
    setShowAddClientForm((current) => {
      const next = !current;
      if (!next) {
        resetComposer();
      }
      return next;
    });
  };

  return (
    <PageShell title={t('clients')} subtitle={t('clientsSubtitle')} showBack>
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('clientIntake')}</p>
                <h2>{t('addClient')}</h2>
              </div>
              <button
                type="button"
                className="icon-button icon-button--accent"
                aria-label={showAddClientForm ? t('closeAddClientForm') : t('openAddClientForm')}
                title={showAddClientForm ? t('closeAddClientForm') : t('openAddClientForm')}
                onClick={toggleComposer}
              >
                {showAddClientForm ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
              </button>
            </div>
            <div className="workflow-defaults">
              <span>{readyStats.readyCount}/{readyStats.totalCount || 0} {t('draftReadyClients')}</span>
              <span>{t('clientProfilesForDrafting')}</span>
            </div>
            {showAddClientForm ? (
              <div className="workflow-section-stack">
                <div className="workflow-helper-card">
                  <strong>{t('aadhaarUploadPreferred')}</strong>
                  <p>{t('aadhaarIntakeChoiceSubtitle')}</p>
                  <p className="helper-text">
                    {aiSummary ? getAiCreditHeadline(aiSummary) : t('aadhaarFlowHint')}
                  </p>
                  <input
                    ref={aadhaarInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="visually-hidden"
                    onChange={(e) => handleAadhaarUpload(e.target.files?.[0] || null)}
                  />
                  <button type="button" className="button" onClick={() => requestAadhaarUpload('primary')}>
                    {t('startAadhaarOcr')}
                  </button>
                  <div className="workflow-choice-row">
                    <button
                      type="button"
                      className={`workflow-choice${intakeMode === 'aadhaar' ? ' workflow-choice--selected' : ''}`}
                      onClick={() => setIntakeMode('aadhaar')}
                    >
                      <strong>{t('useAadhaarFlow')}</strong>
                      <p>{t('aadhaarFlowHint')}</p>
                    </button>
                    <button
                      type="button"
                      className={`workflow-choice${intakeMode === 'manual' ? ' workflow-choice--selected' : ''}`}
                      onClick={() => setIntakeMode('manual')}
                    >
                      <strong>{t('useManualFlow')}</strong>
                      <p>{t('manualFlowHint')}</p>
                    </button>
                  </div>
                  {aadhaarStatus.error ? <p className="inline-feedback inline-feedback--error">{aadhaarStatus.error}</p> : null}
                </div>

                {shouldShowManualForm ? (
                  <form onSubmit={handleAddClient}>
                    <div className="form-grid">
                      {intakeMode === 'aadhaar' ? (
                        <div className="form-group full-span">
                          <label>{t('aadhaarUploadPreferred')}:</label>
                          <input
                            ref={aadhaarReviewInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="visually-hidden"
                            onChange={(e) => handleAadhaarUpload(e.target.files?.[0] || null)}
                          />
                          <button type="button" className="button button--secondary" onClick={() => requestAadhaarUpload('review')}>
                            {t('replaceAadhaarFile')}
                          </button>
                        </div>
                      ) : null}
                      {aadhaarStatus.success ? <p className="inline-feedback full-span">{t('aadhaarReadSuccess')}</p> : null}
                      {aadhaarStatus.error ? <p className="inline-feedback inline-feedback--error full-span">{aadhaarStatus.error}</p> : null}
                      {aadhaarStatus.warnings.length ? (
                        <div className="record-card full-span">
                          <strong>{t('aadhaarNeedsReview')}</strong>
                          {aadhaarStatus.warnings.map((warning) => <p key={warning} className="helper-text">{warning}</p>)}
                        </div>
                      ) : null}
                      <div className="form-group">
                        <label>{t('name')}:</label>
                        <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('phone')}:</label>
                        <input type="text" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('email')}:</label>
                        <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>{t('preferredLanguage')}:</label>
                        <select value={form.preferredLanguage} onChange={(e) => updateField('preferredLanguage', e.target.value)}>
                          <option value="en">{t('english')}</option>
                          <option value="hi">{t('hindi')}</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('relationLabel')}:</label>
                        <select value={form.relationLabel} onChange={(e) => updateField('relationLabel', e.target.value)}>
                          {relationLabelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('relationName')}:</label>
                        <input type="text" value={form.relationName} onChange={(e) => updateField('relationName', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('age')}:</label>
                        <input type="number" min="0" value={form.age} onChange={(e) => updateField('age', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('dateOfBirth')}:</label>
                        <input type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('gender')}:</label>
                        <select value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                          {genderOptions.map((option) => <option key={option} value={option}>{t(option.toLowerCase())}</option>)}
                        </select>
                      </div>
                      <div className="form-group full-span">
                        <label>{t('address')}:</label>
                        <textarea value={form.address} onChange={(e) => updateField('address', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('aadhaarName')}:</label>
                        <input type="text" value={form.aadhaarName} onChange={(e) => updateField('aadhaarName', e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>{t('aadhaarNumber')}:</label>
                        <input type="text" value={form.aadhaarNumber} onChange={(e) => updateField('aadhaarNumber', e.target.value)} required />
                      </div>
                      {aadhaarStatus.rawText ? (
                        <div className="form-group full-span">
                          <label>{t('aadhaarOcrPreview')}:</label>
                          <textarea value={aadhaarStatus.rawText} readOnly rows="5" />
                        </div>
                      ) : null}
                    </div>
                    <button type="submit" className="button" disabled={saving}>{saving ? t('saving') : t('addClient')}</button>
                  </form>
                ) : null}
              </div>
            ) : (
              <p className="empty-state">{t('addClientHint')}</p>
            )}
          </section>

          {!showAddClientForm ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t('directory')}</p>
                  <h2>{clients.length} {t('clients').toLowerCase()}</h2>
                </div>
              </div>
              {clients.length === 0 ? (
                <p className="empty-state">{t('clientsEmpty')}</p>
              ) : (
                <div className="record-list">
                  {clients.map((client) => (
                    <article
                      key={client.id}
                      className="record-item record-item--interactive"
                      onClick={() => navigate(`/clients/${client.id}`)}
                    >
                      <div>
                        <strong>{client.name}</strong>
                        {buildClientDraftingSummary(client).map((line) => <p key={`${client.id}-${line}`}>{line}</p>)}
                      </div>
                      <div className="record-item__action">
                        <span className={`badge${isClientDraftReady(client) ? '' : ' badge--muted'}`}>
                          {isClientDraftReady(client) ? t('draftReady') : t('draftProfileIncomplete')}
                        </span>
                        <ArrowRightIcon className="app-icon" />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {aadhaarStatus.loading ? (
            <LoadingState overlay label={t('aadhaarProcessingTitle')}>
              <div className="loading-state__meta">
                <p>{t('aadhaarProcessingBody')}</p>
              </div>
            </LoadingState>
          ) : null}
          {showAiAccessModal ? (
            <div className="app-modal">
              <button type="button" className="app-modal__scrim" aria-label={t('closeNavigation')} onClick={() => setShowAiAccessModal(false)} />
              <div className="app-modal__surface">
                <p className="eyebrow">{t('aiAccessEyebrow')}</p>
                <h2>{t('aadhaarAiGateTitle')}</h2>
                <p>{t('aadhaarAiGateBody')}</p>
                <div className="workflow-defaults">
                  <span>{aiSummary ? getAiCreditHeadline(aiSummary) : t('noAiCreditsLeft')}</span>
                </div>
                <div className="button-row top-space">
                  <button type="button" className="button" onClick={() => navigate('/premium?feature=aadhaar_ocr')}>
                    {t('manageAiAccess')}
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setShowAiAccessModal(false)}>
                    {t('back')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </PageShell>
  );
};

export default Clients;
