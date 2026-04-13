import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { seedAdvocateData } from '../utils/seedData';
import LoadingState from './LoadingState';
import { syncAdvocateClientAccess } from '../utils/clientAccessRecords';
import { formatLifecycleDate, isHearingLifecycleStep } from '../utils/lifecycle';

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hearings, setHearings] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [stats, setStats] = useState({
    cases: 0,
    clients: 0,
    hearings: 0,
    payments: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      const advocateId = auth.currentUser?.uid;
      if (!advocateId) {
        setLoading(false);
        return;
      }

      try {
        await seedAdvocateData(advocateId);
        await syncAdvocateClientAccess(advocateId);

        const [casesSnap, clientsSnap, paymentsSnap] = await Promise.all([
          getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
          getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId))),
          getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId))),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nextSevenDays = new Date(today);
        nextSevenDays.setDate(today.getDate() + 7);

        const caseRecords = casesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const hearingRecords = caseRecords
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

        setHearings(upcoming.slice(0, 4));
        setReminders(upcoming.slice(0, 2));
        setStats({
          hearings: hearingRecords.length,
          cases: caseRecords.length,
          clients: clientsSnap.size,
          payments: paymentsSnap.size,
        });
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  return (
    <PageShell
      title={t('practiceDashboard')}
      subtitle={t('practiceDashboardSubtitle')}
    >
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
      <>
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
          <strong>{t('clientLinks')}</strong>
          <span>{t('shareSecureClientLinks')}</span>
        </Link>
      </section>
      </>
      )}
    </PageShell>
  );
};

export default Dashboard;
