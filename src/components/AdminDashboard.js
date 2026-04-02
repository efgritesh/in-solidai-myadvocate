import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { seedAdminData } from '../utils/seedData';

const AdminDashboard = () => {
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
      title="Admin dashboard"
      subtitle="A lightweight IT admin view for account health, role distribution, and platform checks."
      showNav={false}
      actions={(
        <button className="button danger" onClick={handleLogout}>
          Logout
        </button>
      )}
    >
      <section className="stats-grid">
        <article className="stat-card">
          <strong>{stats.admins}</strong>
          <span>Admins</span>
        </article>
        <article className="stat-card">
          <strong>{stats.advocates}</strong>
          <span>Advocates</span>
        </article>
        <article className="stat-card">
          <strong>{stats.clients}</strong>
          <span>Clients</span>
        </article>
        <article className="stat-card">
          <strong>{stats.cases}</strong>
          <span>Cases</span>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operations</p>
            <h2>System alerts</h2>
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
            <p className="eyebrow">Platform snapshot</p>
            <h2>IT admin controls</h2>
          </div>
        </div>
        <div className="record-list">
          <article className="record-item">
            <div>
              <strong>Authentication</strong>
              <p>Email/password and Google sign-in are enabled in the app flow for testing.</p>
            </div>
            <span className="badge">Active</span>
          </article>
          <article className="record-item">
            <div>
              <strong>Payments tracked</strong>
              <p>{stats.payments} payment records are available across advocate and client views.</p>
            </div>
            <span className="badge">Live</span>
          </article>
        </div>
      </section>
    </PageShell>
  );
};

export default AdminDashboard;
