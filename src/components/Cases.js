import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PageShell from './PageShell';

const Cases = () => {
  const [cases, setCases] = useState([]);
  const [caseNumber, setCaseNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState('Open');

  const fetchCases = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const querySnapshot = await getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId)));
    setCases(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleAddCase = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;

    await addDoc(collection(db, 'cases'), {
      advocate_id: advocateId,
      case_number: caseNumber,
      client_name: clientName,
      status,
    });

    setCaseNumber('');
    setClientName('');
    setStatus('Open');
    await fetchCases();
  };

  return (
    <PageShell
      title="Cases"
      subtitle="Add and review matter details quickly, even on a phone in court."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">New matter</p>
            <h2>Add a case</h2>
          </div>
        </div>
        <form onSubmit={handleAddCase}>
          <div className="form-grid">
            <div className="form-group">
              <label>Case Number:</label>
              <input
                type="text"
                placeholder="e.g. DEL-CIV-204/2026"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Client Name:</label>
              <input
                type="text"
                placeholder="Client full name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Status:</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>
          <button type="submit" className="button">Add Case</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current matters</p>
            <h2>{cases.length} cases</h2>
          </div>
        </div>
        {cases.length === 0 ? (
          <p className="empty-state">No cases yet. Add your first matter to start tracking progress.</p>
        ) : (
          <div className="record-list">
            {cases.map((caseItem) => (
              <article key={caseItem.id} className="record-item">
                <div>
                  <strong>{caseItem.case_number}</strong>
                  <p>{caseItem.client_name}</p>
                </div>
                <span className="badge">{caseItem.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Cases;
