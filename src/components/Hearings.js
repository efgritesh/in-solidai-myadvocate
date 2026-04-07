import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';

const Hearings = () => {
  const { t } = useTranslation();
  const [hearings, setHearings] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  const fetchHearings = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const querySnapshot = await getDocs(query(collection(db, 'hearings'), where('advocate_id', '==', advocateId)));
    setHearings(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  useEffect(() => {
    fetchHearings();
  }, []);

  const handleAddHearing = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;

    await addDoc(collection(db, 'hearings'), {
      advocate_id: advocateId,
      case_id: caseId,
      date,
      description,
    });

    setCaseId('');
    setDate('');
    setDescription('');
    await fetchHearings();
  };

  return (
    <PageShell title={t('hearings')} subtitle={t('hearingsSubtitle')} showBack>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('schedule')}</p>
            <h2>{t('addHearing')}</h2>
          </div>
        </div>
        <form onSubmit={handleAddHearing}>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('caseId')}:</label>
              <input
                type="text"
                placeholder={t('linkedCaseNumber')}
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('date')}:</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('description')}:</label>
              <input
                type="text"
                placeholder={t('purposeOfHearing')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="button">{t('addHearing')}</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('calendar')}</p>
            <h2>{hearings.length} {t('hearings').toLowerCase()}</h2>
          </div>
        </div>
        {hearings.length === 0 ? (
          <p className="empty-state">{t('hearingsEmpty')}</p>
        ) : (
          <div className="record-list">
            {hearings.map((hearing) => (
              <article key={hearing.id} className="record-item">
                <div>
                  <strong>{hearing.case_id}</strong>
                  <p>{hearing.description || t('noDescriptionAdded')}</p>
                </div>
                <span className="badge">{hearing.date}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Hearings;
