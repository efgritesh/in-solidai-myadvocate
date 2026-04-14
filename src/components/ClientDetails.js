import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon, CasesIcon, CloseIcon, DocumentsIcon, PaymentsIcon, PlusIcon } from './AppIcons';
import { updateClientProfile } from '../utils/clientProfiles';
import {
  buildClientDraftingSummary,
  genderOptions,
  isClientDraftReady,
  relationLabelOptions,
} from '../utils/draftingProfiles';

const ClientDetails = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [relatedCases, setRelatedCases] = useState([]);
  const [relatedPayments, setRelatedPayments] = useState([]);
  const [relatedDocuments, setRelatedDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [form, setForm] = useState({
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
  });

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const loadClientDetails = useCallback(async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId || !clientId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const clientsSnapshot = await getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId)));
      const nextClient = clientsSnapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .find((clientRecord) => clientRecord.id === clientId);

      if (!nextClient) {
        setClient(null);
        setRelatedCases([]);
        setRelatedPayments([]);
        setRelatedDocuments([]);
        return;
      }

      const [casesSnapshot, paymentsSnapshot, documentsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'documents'), where('advocate_id', '==', advocateId))),
      ]);

      const nextCases = casesSnapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .filter(
          (caseRecord) =>
            caseRecord.client_id === nextClient.id ||
            caseRecord.client_name === nextClient.name ||
            (nextClient.email && caseRecord.client_email === nextClient.email) ||
            (nextClient.phone && caseRecord.client_phone === nextClient.phone)
        );

      const caseNumbers = new Set(nextCases.map((caseRecord) => caseRecord.case_number));

      setClient(nextClient);
      setForm({
        name: nextClient.name || '',
        phone: nextClient.phone || '',
        email: nextClient.email || '',
        preferredLanguage: nextClient.preferredLanguage || 'en',
        relationLabel: nextClient.relationLabel || 'S/o',
        relationName: nextClient.relationName || '',
        age: nextClient.age || '',
        dateOfBirth: nextClient.dateOfBirth || '',
        gender: nextClient.gender || 'Male',
        address: nextClient.address || '',
        aadhaarName: nextClient.aadhaarName || '',
        aadhaarNumber: nextClient.aadhaarNumber || '',
      });
      setRelatedCases(nextCases);
      setRelatedPayments(
        paymentsSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
          .filter((payment) => caseNumbers.has(payment.case_id))
      );
      setRelatedDocuments(
        documentsSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
          .filter((documentRecord) => caseNumbers.has(documentRecord.case_id))
      );
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadClientDetails();
  }, [loadClientDetails]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!client) return;
    setSaving(true);
    try {
      await updateClientProfile({
        clientId: client.id,
        advocateId: auth.currentUser?.uid,
        data: {
          ...form,
          draftReady: true,
        },
        aadhaarFile,
      });
      setAadhaarFile(null);
      setShowEdit(false);
      await loadClientDetails();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell title={t('clientDetails')} subtitle={t('loadingClientDetails')} showBack>
        <LoadingState label={t('loadingClientDetails')} />
      </PageShell>
    );
  }

  if (!client) {
    return (
      <PageShell title={t('clientDetails')} subtitle={t('clientsSubtitle')} showBack>
        <section className="panel">
          <p className="empty-state">{t('clientNotFound')}</p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell title={client.name} subtitle={t('clientDetailsSubtitle')} showBack>
      <section className="hero-card case-hero">
        <div>
          <p className="eyebrow">{t('clientLabel')}</p>
          <h2>{client.name}</h2>
          {buildClientDraftingSummary(client).map((line) => <p key={`summary-${line}`}>{line}</p>)}
        </div>
        <div className="case-hero__meta">
          <span className="case-hero__progress">
            {isClientDraftReady(client) ? t('draftReady') : t('draftProfileIncomplete')}
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('clientDraftProfile')}</p>
            <h2>{t('legalIdentity')}</h2>
          </div>
          <button
            type="button"
            className="icon-button icon-button--accent"
            onClick={() => setShowEdit((current) => !current)}
            aria-label={showEdit ? t('closeEditClientProfile') : t('editClientProfile')}
            title={showEdit ? t('closeEditClientProfile') : t('editClientProfile')}
          >
            {showEdit ? <CloseIcon className="app-icon" /> : <PlusIcon className="app-icon" />}
          </button>
        </div>

        {showEdit ? (
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-group"><label>{t('name')}:</label><input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required /></div>
              <div className="form-group"><label>{t('phone')}:</label><input type="text" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required /></div>
              <div className="form-group"><label>{t('email')}:</label><input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} /></div>
              <div className="form-group"><label>{t('preferredLanguage')}:</label><select value={form.preferredLanguage} onChange={(e) => updateField('preferredLanguage', e.target.value)}><option value="en">{t('english')}</option><option value="hi">{t('hindi')}</option></select></div>
              <div className="form-group"><label>{t('relationLabel')}:</label><select value={form.relationLabel} onChange={(e) => updateField('relationLabel', e.target.value)}>{relationLabelOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
              <div className="form-group"><label>{t('relationName')}:</label><input type="text" value={form.relationName} onChange={(e) => updateField('relationName', e.target.value)} required /></div>
              <div className="form-group"><label>{t('age')}:</label><input type="number" min="0" value={form.age} onChange={(e) => updateField('age', e.target.value)} required /></div>
              <div className="form-group"><label>{t('dateOfBirth')}:</label><input type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} required /></div>
              <div className="form-group"><label>{t('gender')}:</label><select value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>{genderOptions.map((option) => <option key={option} value={option}>{t(option.toLowerCase())}</option>)}</select></div>
              <div className="form-group full-span"><label>{t('address')}:</label><textarea value={form.address} onChange={(e) => updateField('address', e.target.value)} required /></div>
              <div className="form-group"><label>{t('aadhaarName')}:</label><input type="text" value={form.aadhaarName} onChange={(e) => updateField('aadhaarName', e.target.value)} required /></div>
              <div className="form-group"><label>{t('aadhaarNumber')}:</label><input type="text" value={form.aadhaarNumber} onChange={(e) => updateField('aadhaarNumber', e.target.value)} required /></div>
              <div className="form-group full-span"><label>{t('aadhaarReference')}:</label><input type="file" accept="image/*,application/pdf" onChange={(e) => setAadhaarFile(e.target.files?.[0] || null)} /></div>
            </div>
            <button type="submit" className="button" disabled={saving}>{saving ? t('saving') : t('save')}</button>
          </form>
        ) : (
          <div className="record-list">
            <article className="record-item"><div><strong>{t('relationLabel')}</strong><p>{client.relationLabel} {client.relationName}</p></div></article>
            <article className="record-item"><div><strong>{t('age')} / {t('dateOfBirth')}</strong><p>{client.age} | {client.dateOfBirth}</p></div></article>
            <article className="record-item"><div><strong>{t('gender')}</strong><p>{client.gender}</p></div></article>
            <article className="record-item"><div><strong>{t('address')}</strong><p>{client.address}</p></div></article>
            <article className="record-item"><div><strong>{t('aadhaarName')}</strong><p>{client.aadhaarName}</p></div></article>
            <article className="record-item"><div><strong>{t('aadhaarNumber')}</strong><p>{client.aadhaarNumber}</p></div></article>
            {client.aadhaarReferenceUrl ? (
              <article className="record-item">
                <div>
                  <strong>{t('aadhaarReference')}</strong>
                  <p>{client.aadhaarReferenceName || t('documentDetails')}</p>
                </div>
                <a className="text-link" href={client.aadhaarReferenceUrl} target="_blank" rel="noopener noreferrer">{t('open')}</a>
              </article>
            ) : null}
          </div>
        )}
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <CasesIcon className="app-icon section-icon" />
          <strong>{relatedCases.length}</strong>
          <span>{t('cases')}</span>
        </article>
        <article className="stat-card">
          <PaymentsIcon className="app-icon section-icon" />
          <strong>{relatedPayments.length}</strong>
          <span>{t('payments')}</span>
        </article>
        <article className="stat-card">
          <DocumentsIcon className="app-icon section-icon" />
          <strong>{relatedDocuments.length}</strong>
          <span>{t('documents')}</span>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('currentMatters')}</p>
            <h2>{t('cases')}</h2>
          </div>
        </div>
        {relatedCases.length === 0 ? (
          <p className="empty-state">{t('clientCasesEmpty')}</p>
        ) : (
          <div className="record-list">
            {relatedCases.map((caseRecord) => (
              <article
                key={caseRecord.id}
                className="record-item record-item--interactive"
                onClick={() => navigate(`/cases/${caseRecord.id}`)}
              >
                <div>
                  <strong>{caseRecord.case_number}</strong>
                  <p>{caseRecord.summary || caseRecord.next_step || t('noSummaryAdded')}</p>
                </div>
                <ArrowRightIcon className="app-icon" />
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default ClientDetails;

