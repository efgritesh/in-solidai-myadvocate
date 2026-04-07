import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { seedAdvocateData } from '../utils/seedData';
import { DocumentsIcon, HearingsIcon, PaymentsIcon, ShareIcon } from './AppIcons';

const Dashboard = () => {
  const { t } = useTranslation();
  const [hearings, setHearings] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [stats, setStats] = useState({
    cases: 0,
    clients: 0,
    hearings: 0,
    payments: 0,
  });

  useEffect(() => {
    const loadDashboard = async () => {
      const advocateId = auth.currentUser?.uid;
      if (!advocateId) return;

      await seedAdvocateData(advocateId);

      const [hearingsSnap, casesSnap, clientsSnap, paymentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'hearings'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId))),
        getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId))),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextSevenDays = new Date(today);
      nextSevenDays.setDate(today.getDate() + 7);

      const hearingRecords = hearingsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const upcoming = hearingRecords.filter((hearing) => {
        const hearingDate = new Date(hearing.date);
        return hearingDate >= today && hearingDate <= nextSevenDays;
      });

      setHearings(upcoming.slice(0, 4));
      setReminders(upcoming.slice(0, 2));
      setStats({
        hearings: hearingRecords.length,
        cases: casesSnap.size,
        clients: clientsSnap.size,
        payments: paymentsSnap.size,
      });
    };

    loadDashboard();
  }, []);

  return (
    <PageShell
      title="Practice dashboard"
      subtitle="Your practice summary with quick access to matters, clients, and active follow-ups."
    >
      <section className="hero-card">
        <div>
          <p className="eyebrow">Today at a glance</p>
          <h2>Everything important is one thumb away.</h2>
          <p>Open cases or clients to handle hearing notes, payment follow-ups, documents, and client links in context.</p>
        </div>
        <Link className="button secondary" to="/invite">
          {t('inviteAdvocates')}
        </Link>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <strong>{stats.cases}</strong>
          <span>Active matters</span>
        </article>
        <article className="stat-card">
          <strong>{stats.clients}</strong>
          <span>Clients</span>
        </article>
        <article className="stat-card">
          <strong>{stats.hearings}</strong>
          <span>Hearings</span>
        </article>
        <article className="stat-card">
          <strong>{stats.payments}</strong>
          <span>Payments</span>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Immediate focus</p>
            <h2>Reminders</h2>
          </div>
        </div>
        {reminders.length === 0 ? (
          <p className="empty-state">No urgent reminders. Your next hearing window is clear.</p>
        ) : (
          <div className="record-list">
            {reminders.map((reminder) => (
              <article key={reminder.id} className="record-item">
                <div>
                  <strong>{reminder.case_id}</strong>
                  <p>{reminder.description}</p>
                </div>
                <span className="badge">{reminder.date}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Next seven days</p>
            <h2>Upcoming hearings</h2>
          </div>
        </div>
        {hearings.length === 0 ? (
          <p className="empty-state">No hearings scheduled in the coming week.</p>
        ) : (
          <div className="record-list">
            {hearings.map((hearing) => (
              <article key={hearing.id} className="record-item">
                <div>
                  <strong>{hearing.case_id}</strong>
                  <p>{hearing.description}</p>
                </div>
                <span className="badge">{hearing.date}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="cta-grid">
        <Link className="action-tile" to="/cases">
          <strong>{t('cases')}</strong>
          <span>Track status and client mapping.</span>
        </Link>
        <Link className="action-tile" to="/clients">
          <strong>{t('clients')}</strong>
          <span>Keep contact details accessible during court visits.</span>
        </Link>
        <article className="action-tile action-tile--dense">
          <div className="action-tile__icons">
            <HearingsIcon className="app-icon" />
            <PaymentsIcon className="app-icon" />
            <DocumentsIcon className="app-icon" />
            <ShareIcon className="app-icon" />
          </div>
          <strong>Case-led workflow</strong>
          <span>Hearings, payments, documents, and sharing now sit under each matter instead of the top nav.</span>
        </article>
      </section>
    </PageShell>
  );
};

export default Dashboard;
