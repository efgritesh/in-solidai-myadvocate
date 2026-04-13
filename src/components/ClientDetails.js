import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon, CasesIcon, DocumentsIcon, PaymentsIcon } from './AppIcons';

const ClientDetails = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [relatedCases, setRelatedCases] = useState([]);
  const [relatedPayments, setRelatedPayments] = useState([]);
  const [relatedDocuments, setRelatedDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadClientDetails = useCallback(async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId || !clientId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const clientsSnapshot = await getDocs(
        query(collection(db, 'clients'), where('advocate_id', '==', advocateId))
      );
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
            caseRecord.client_name === nextClient.name ||
            (nextClient.email && caseRecord.client_email === nextClient.email) ||
            (nextClient.phone && caseRecord.client_phone === nextClient.phone)
        );

      const caseNumbers = new Set(nextCases.map((caseRecord) => caseRecord.case_number));

      setClient(nextClient);
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
          <p>{client.phone}</p>
          <p>{client.email || t('noEmailAdded')}</p>
        </div>
        <div className="case-hero__meta">
          <span className="case-hero__progress">
            {(client.preferredLanguage || 'en').toUpperCase()} | {t('preferredLanguage')}
          </span>
        </div>
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
