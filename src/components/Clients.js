import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon, CloseIcon, PlusIcon } from './AppIcons';
import { createClientProfile, extractAadhaarDetails } from '../utils/clientProfiles';
import {
  buildClientDraftingSummary,
  genderOptions,
  isClientDraftReady,
  relationLabelOptions,
} from '../utils/draftingProfiles';

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

const Clients = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyClientForm);
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [aadhaarStatus, setAadhaarStatus] = useState({ loading: false, success: false, warnings: [], rawText: '', error: '' });
  const advocateId = auth.currentUser?.uid || '';

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

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
          draftReady: true,
        },
        aadhaarFile,
      });

      setForm(emptyClientForm);
      setAadhaarFile(null);
      setAadhaarStatus({ loading: false, success: false, warnings: [], rawText: '', error: '' });
      setShowAddClientForm(false);
      await fetchClients();
    } finally {
      setSaving(false);
    }
  };

  const applyAadhaarFields = (extracted = {}) => {
    setForm((current) => ({
      ...current,
      name: current.name || extracted.name || extracted.aadhaarName || '',
      aadhaarName: extracted.aadhaarName || current.aadhaarName || '',
      aadhaarNumber: extracted.aadhaarNumber || current.aadhaarNumber || '',
      dateOfBirth: extracted.dateOfBirth || current.dateOfBirth || '',
      age: extracted.age || current.age || '',
      gender: extracted.gender || current.gender || '',
      address: extracted.address || current.address || '',
    }));
  };

  const handleAadhaarUpload = async (file) => {
    setAadhaarFile(file || null);
    if (!file || !advocateId) {
      setAadhaarStatus({ loading: false, success: false, warnings: [], rawText: '', error: '' });
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
      setAadhaarStatus({
        loading: false,
        success: false,
        warnings: [],
        rawText: '',
        error: error.message || t('aadhaarReadFailed'),
      });
    }
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
                onClick={() => setShowAddClientForm((current) => !current)}
              >
                {showAddClientForm ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
              </button>
            </div>
            <div className="workflow-defaults">
              <span>{readyStats.readyCount}/{readyStats.totalCount || 0} {t('draftReadyClients')}</span>
              <span>{t('clientProfilesForDrafting')}</span>
            </div>
            {showAddClientForm ? (
              <form onSubmit={handleAddClient}>
                <div className="form-grid">
                  <div className="form-group full-span">
                    <label>{t('aadhaarUploadPreferred')}:</label>
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => handleAadhaarUpload(e.target.files?.[0] || null)} />
                  </div>
                  {aadhaarStatus.loading ? <p className="inline-feedback full-span">{t('aadhaarReading')}</p> : null}
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
        </>
      )}
    </PageShell>
  );
};

export default Clients;
