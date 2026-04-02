import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PageShell from './PageShell';

const Hearings = () => {
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
    <PageShell
      title="Hearings"
      subtitle="See upcoming court dates clearly and update them without scrolling around."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h2>Add a hearing</h2>
          </div>
        </div>
        <form onSubmit={handleAddHearing}>
          <div className="form-grid">
            <div className="form-group">
              <label>Case ID:</label>
              <input
                type="text"
                placeholder="Linked case number"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Date:</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Description:</label>
              <input
                type="text"
                placeholder="Purpose of hearing"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="button">Add Hearing</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>{hearings.length} hearings</h2>
          </div>
        </div>
        {hearings.length === 0 ? (
          <p className="empty-state">No hearings added yet. Start with the next listed matter.</p>
        ) : (
          <div className="record-list">
            {hearings.map((hearing) => (
              <article key={hearing.id} className="record-item">
                <div>
                  <strong>{hearing.case_id}</strong>
                  <p>{hearing.description || 'No description added'}</p>
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
