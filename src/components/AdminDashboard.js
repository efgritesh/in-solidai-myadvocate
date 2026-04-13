import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { seedAdminData } from '../utils/seedData';
import LoadingState from './LoadingState';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    admins: 1,
    alerts: 0,
    checks: 2,
    environment: 1,
  });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAdminData = async () => {
      const adminId = auth.currentUser?.uid;
      if (!adminId) {
        setLoading(false);
        return;
      }

      try {
        await seedAdminData(adminId);

        const [alertsSnap] = await Promise.all([
          getDocs(query(collection(db, 'system_alerts'), where('admin_id', '==', adminId))),
        ]);

        setStats({
          admins: 1,
          alerts: alertsSnap.size,
          checks: 2,
          environment: 1,
        });
        setAlerts(alertsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      } finally {
        setLoading(false);
      }
    };

    loadAdminData();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <PageShell
      title={t('adminDashboard')}
      subtitle={t('adminDashboardSubtitle')}
      showNav={false}
      actions={(
        <button className="button danger" onClick={handleLogout}>
          {t('logout')}
        </button>
      )}
    >
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
      <>
      <section className="stats-grid">
        <article className="stat-card">
          <strong>{stats.admins}</strong>
          <span>{t('admins')}</span>
        </article>
        <article className="stat-card">
          <strong>{stats.alerts}</strong>
          <span>{t('systemAlerts')}</span>
        </article>
        <article className="stat-card">
          <strong>{stats.checks}</strong>
          <span>{t('operations')}</span>
        </article>
        <article className="stat-card">
          <strong>{stats.environment}</strong>
          <span>{t('live')}</span>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('operations')}</p>
            <h2>{t('systemAlerts')}</h2>
          </div>
        </div>
        <div className="record-list">
          {alerts.map((alertItem) => (
            <article key={alertItem.id} className="record-item">
              <div>
                <strong>{alertItem.title}</strong>
                <p>{alertItem.detail}</p>
              </div>
              <span className="badge">{alertItem.severity}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('platformSnapshot')}</p>
            <h2>{t('itAdminControls')}</h2>
          </div>
        </div>
        <div className="record-list">
          <article className="record-item">
            <div>
              <strong>{t('authentication')}</strong>
              <p>{t('authenticationSummary')}</p>
            </div>
            <span className="badge">{t('active')}</span>
          </article>
          <article className="record-item">
            <div>
              <strong>{t('paymentsTracked')}</strong>
              <p>{t('adminDataIsolationSummary')}</p>
            </div>
            <span className="badge">{t('live')}</span>
          </article>
        </div>
      </section>
      </>
      )}
    </PageShell>
  );
};

export default AdminDashboard;
