import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { seedAdminData } from '../utils/seedData';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    admins: 0,
    advocates: 0,
    clients: 0,
    cases: 0,
    payments: 0,
  });
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const loadAdminData = async () => {
      const adminId = auth.currentUser?.uid;
      if (!adminId) return;

      await seedAdminData(adminId);

      const [usersSnap, casesSnap, paymentsSnap, alertsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'cases')),
        getDocs(collection(db, 'payments')),
        getDocs(query(collection(db, 'system_alerts'), where('admin_id', '==', adminId))),
      ]);

      const users = usersSnap.docs.map((docItem) => docItem.data());
      setStats({
        admins: users.filter((user) => user.role === 'admin').length,
        advocates: users.filter((user) => user.role === 'advocate').length,
        clients: users.filter((user) => user.role === 'client').length,
        cases: casesSnap.size,
        payments: paymentsSnap.size,
      });
      setAlerts(alertsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
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
      <section className="stats-grid">
        <article className="stat-card">
          <strong>{stats.admins}</strong>
          <span>{t('admins')}</span>
        </article>
        <article className="stat-card">
          <strong>{stats.advocates}</strong>
          <span>{t('advocates')}</span>
        </article>
        <article className="stat-card">
          <strong>{stats.clients}</strong>
          <span>{t('clients')}</span>
        </article>
        <article className="stat-card">
          <strong>{stats.cases}</strong>
          <span>{t('cases')}</span>
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
              <p>{t('paymentsTrackedSummary', { count: stats.payments })}</p>
            </div>
            <span className="badge">{t('live')}</span>
          </article>
        </div>
      </section>
    </PageShell>
  );
};

export default AdminDashboard;
