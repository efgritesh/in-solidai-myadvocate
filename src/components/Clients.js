import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PageShell from './PageShell';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const fetchClients = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const querySnapshot = await getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId)));
    setClients(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
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
    });

    setName('');
    setPhone('');
    setEmail('');
    await fetchClients();
  };

  return (
    <PageShell
      title="Clients"
      subtitle="Keep key contact details reachable in a few taps."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Client intake</p>
            <h2>Add a client</h2>
          </div>
        </div>
        <form onSubmit={handleAddClient}>
          <div className="form-grid">
            <div className="form-group">
              <label>Name:</label>
              <input
                type="text"
                placeholder="Client full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Phone:</label>
              <input
                type="text"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Email:</label>
              <input
                type="email"
                placeholder="Optional email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="button">Add Client</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>{clients.length} clients</h2>
          </div>
        </div>
        {clients.length === 0 ? (
          <p className="empty-state">Your client list is empty. Add one to begin organizing your practice.</p>
        ) : (
          <div className="record-list">
            {clients.map((client) => (
              <article key={client.id} className="record-item">
                <div>
                  <strong>{client.name}</strong>
                  <p>{client.email || 'No email added'}</p>
                </div>
                <span className="badge">{client.phone}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Clients;
