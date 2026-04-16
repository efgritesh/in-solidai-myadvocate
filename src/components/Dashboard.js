import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { cleanupLegacyAdvocateDemoData } from '../utils/seedData';
import LoadingState from './LoadingState';
import { formatLifecycleDate, isHearingLifecycleStep } from '../utils/lifecycle';
import { DraftingIcon } from './AppIcons';
import useCurrentUserProfile from '../utils/useCurrentUserProfile';
import useAiAccessSummary from '../utils/useAiAccessSummary';
import { canUseAiNow, getAiCreditHeadline } from '../utils/billing';
import { useFirestoreCollection } from '../utils/firestoreCache';

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useCurrentUserProfile();
  const { summary: aiSummary } = useAiAccessSummary();
  const [dashboardError, setDashboardError] = useState('');
  const advocateId = auth.currentUser?.uid || '';

  const casesState = useFirestoreCollection({
    enabled: Boolean(advocateId),
    queryFactory: () => query(collection(db, 'cases'), where('advocate_id', '==', advocateId)),
    queryKey: [advocateId, 'dashboard-cases'],
  });
  const clientsState = useFirestoreCollection({
    enabled: Boolean(advocateId),
    queryFactory: () => query(collection(db, 'clients'), where('advocate_id', '==', advocateId)),
    queryKey: [advocateId, 'dashboard-clients'],
  });
  const paymentsState = useFirestoreCollection({
    enabled: Boolean(advocateId),
    queryFactory: () => query(collection(db, 'payments'), where('advocate_id', '==', advocateId)),
    queryKey: [advocateId, 'dashboard-payments'],
  });

  useEffect(() => {
    if (!advocateId) {
      return;
    }
    cleanupLegacyAdvocateDemoData(advocateId).catch((error) => {
      console.error('Dashboard cleanup failed', error);
    });
  }, [advocateId]);

  useEffect(() => {
    const firstError = casesState.error || clientsState.error || paymentsState.error;
    setDashboardError(firstError?.message || '');
  }, [casesState.error, clientsState.error, paymentsState.error]);

  const { hearings, reminders, stats } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextSevenDays = new Date(today);
    nextSevenDays.setDate(today.getDate() + 7);

    const hearingRecords = (casesState.data || [])
      .flatMap((caseRecord) =>
        (caseRecord.lifecycle || [])
          .filter((step) => isHearingLifecycleStep(step) && step.scheduled_date)
          .map((step) => ({
            id: `${caseRecord.id}-${step.id}`,
            case_id: caseRecord.case_number,
            case_doc_id: caseRecord.id,
            date: step.scheduled_date,
            description: step.notes || step.title,
            purpose: step.title,
            status: step.status,
          }))
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const upcoming = hearingRecords.filter((hearing) => {
      const hearingDate = new Date(hearing.date);
      return hearingDate >= today && hearingDate <= nextSevenDays;
    });

    return {
      hearings: upcoming.slice(0, 4),
      reminders: upcoming.slice(0, 2),
      stats: {
        hearings: hearingRecords.length,
        cases: casesState.data.length,
        clients: clientsState.data.length,
        payments: paymentsState.data.length,
      },
    };
  }, [casesState.data, clientsState.data.length, paymentsState.data.length]);

  const loading = casesState.loadingInitial || clientsState.loadingInitial || paymentsState.loadingInitial;
  const refreshing = casesState.refreshing || clientsState.refreshing || paymentsState.refreshing;

  return (
    <PageShell
      title={t('practiceDashboard')}
      subtitle={t('practiceDashboardSubtitle')}
    >
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
      <>
      {dashboardError ? <p className="inline-feedback inline-feedback--error">{dashboardError}</p> : null}
      {refreshing ? <p className="helper-text">{t('refreshingWorkspace', { defaultValue: 'Refreshing from your latest saved data...' })}</p> : null}
      <section className="hero-card">
        <div>
          <p className="eyebrow">{t('todayAtAGlance')}</p>
          <h2>{t('dashboardHeroTitle')}</h2>
          <p>{t('dashboardHeroSubtitle')}</p>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card stat-card--interactive" onClick={() => navigate('/cases')}>
          <strong>{stats.cases}</strong>
          <span>{t('activeMatters')}</span>
        </article>
        <article className="stat-card stat-card--interactive" onClick={() => navigate('/clients')}>
          <strong>{stats.clients}</strong>
          <span>{t('clients')}</span>
        </article>
        <article className="stat-card stat-card--interactive" onClick={() => navigate('/hearings')}>
          <strong>{stats.hearings}</strong>
          <span>{t('hearings')}</span>
        </article>
        <article className="stat-card stat-card--interactive" onClick={() => navigate('/payments')}>
          <strong>{stats.payments}</strong>
          <span>{t('payments')}</span>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('immediateFocus')}</p>
            <h2>{t('reminders')}</h2>
          </div>
        </div>
        {reminders.length === 0 ? (
          <p className="empty-state">{t('noUrgentReminders')}</p>
        ) : (
          <div className="record-list">
            {reminders.map((reminder) => (
              <article
                key={reminder.id}
                className="record-item record-item--interactive"
                onClick={() => reminder.case_doc_id && navigate(`/cases/${reminder.case_doc_id}`)}
              >
                <div>
                  <strong>{reminder.case_id}</strong>
                  <p>{reminder.description}</p>
                </div>
                <span className="badge">{formatLifecycleDate(reminder.date)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('nextSevenDays')}</p>
            <h2>{t('upcomingHearings')}</h2>
          </div>
        </div>
        {hearings.length === 0 ? (
          <p className="empty-state">{t('noHearingsWeek')}</p>
        ) : (
          <div className="record-list">
            {hearings.map((hearing) => (
              <article
                key={hearing.id}
                className="record-item record-item--interactive"
                onClick={() => hearing.case_doc_id && navigate(`/cases/${hearing.case_doc_id}`)}
              >
                <div>
                  <strong>{hearing.case_id}</strong>
                  <p>{hearing.description}</p>
                </div>
                <span className="badge">{formatLifecycleDate(hearing.date)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="cta-grid">
        <Link className="action-tile" to="/cases">
          <strong>{t('cases')}</strong>
          <span>{t('trackStatusClientMapping')}</span>
        </Link>
        <Link className="action-tile" to="/clients">
          <strong>{t('clients')}</strong>
          <span>{t('keepContactsAccessible')}</span>
        </Link>
        <Link className="action-tile" to="/invite">
          <strong>{t('inviteAdvocates')}</strong>
          <span>{t('generateLink')}</span>
        </Link>
        <Link className="action-tile action-tile--drafting" to="/drafting">
          <div className="action-tile__header">
            <DraftingIcon className="app-icon" />
            <strong>{t('aiDraftingAssistant')}</strong>
            {!canUseAiNow(aiSummary || profile || {}) ? <span className="premium-pill premium-pill--inline">{t('aiLockedShort')}</span> : null}
          </div>
          <span>{aiSummary ? getAiCreditHeadline(aiSummary) : t('dashboardDraftingCardSubtitle')}</span>
        </Link>
      </section>
      </>
      )}
    </PageShell>
  );
};

export default Dashboard;
