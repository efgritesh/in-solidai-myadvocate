import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon, CloseIcon, PlusIcon } from './AppIcons';

const Clients = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [showAddClientForm, setShowAddClientForm] = useState(false);

  const fetchClients = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) {
      setLoading(false);
      return;
    }
    try {
      const querySnapshot = await getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId)));
      setClients(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleAddClient = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;

    await addDoc(collection(db, 'clients'), {
      advocate_id: advocateId,
      name,
      phone,
      email,
      preferredLanguage,
    });

    setName('');
    setPhone('');
    setEmail('');
    setPreferredLanguage('en');
    setShowAddClientForm(false);
    await fetchClients();
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
        {showAddClientForm ? (
        <form onSubmit={handleAddClient}>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('name')}:</label>
              <input
                type="text"
                placeholder={t('clientFullName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('phone')}:</label>
              <input
                type="text"
                placeholder={t('mobileNumber')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('email')}:</label>
              <input
                type="email"
                placeholder={t('optionalEmail')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t('preferredLanguage')}:</label>
              <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
                <option value="en">{t('english')}</option>
                <option value="hi">{t('hindi')}</option>
              </select>
            </div>
          </div>
          <button type="submit" className="button">{t('addClient')}</button>
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
                  <p>{client.email || t('noEmailAdded')}</p>
                </div>
                <div className="record-item__action">
                  <span className="badge">{client.phone} | {(client.preferredLanguage || 'en').toUpperCase()}</span>
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
