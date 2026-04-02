import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PageShell from './PageShell';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [requestedFromClient, setRequestedFromClient] = useState(true);

  const fetchPayments = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const querySnapshot = await getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId)));
    setPayments(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const caseSnapshot = await getDocs(
      query(
        collection(db, 'cases'),
        where('advocate_id', '==', advocateId),
        where('case_number', '==', caseId)
      )
    );
    const caseRecord = caseSnapshot.docs[0]?.data();

    await addDoc(collection(db, 'payments'), {
      advocate_id: advocateId,
      case_id: caseId,
      amount: parseFloat(amount),
      date,
      description,
      status: requestedFromClient ? 'Requested' : 'Paid',
      requested_from_client: requestedFromClient,
      client_access_token: caseRecord?.client_access_token || '',
    });

    setCaseId('');
    setAmount('');
    setDate('');
    setDescription('');
    setRequestedFromClient(true);
    await fetchPayments();
  };

  return (
    <PageShell
      title="Payments"
      subtitle="Record fees fast and keep collection history visible during client follow-ups."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fee entry</p>
            <h2>Add a payment</h2>
          </div>
        </div>
        <form onSubmit={handleAddPayment}>
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
              <label>Amount:</label>
              <input
                type="number"
                placeholder="Amount in INR"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
                placeholder="What was the payment for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Client action:</label>
              <select value={requestedFromClient ? 'request' : 'recorded'} onChange={(e) => setRequestedFromClient(e.target.value === 'request')}>
                <option value="request">Request client payment</option>
                <option value="recorded">Record received payment</option>
              </select>
            </div>
          </div>
          <button type="submit" className="button">Add Payment</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Collections</p>
            <h2>{payments.length} entries</h2>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="empty-state">No payments recorded yet. Add the latest received amount to start tracking.</p>
        ) : (
          <div className="record-list">
            {payments.map((payment) => (
              <article key={payment.id} className="record-item">
                <div>
                  <strong>{payment.case_id}</strong>
                  <p>{payment.description || 'No description added'}</p>
                </div>
                <span className="badge">{formatCurrency(payment.amount)} • {payment.status || 'Paid'}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Payments;
