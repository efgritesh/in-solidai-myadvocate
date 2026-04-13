import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { syncCaseAccessPayment } from '../utils/clientAccessRecords';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);

const Payments = () => {
  const { t } = useTranslation();
  const [payments, setPayments] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [requestedFromClient, setRequestedFromClient] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) {
      setLoading(false);
      return;
    }
    try {
      const querySnapshot = await getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId)));
      setPayments(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const caseSnapshot = await getDocs(
      query(collection(db, 'cases'), where('advocate_id', '==', advocateId), where('case_number', '==', caseId))
    );
    const caseRecord = caseSnapshot.docs[0]?.data();

    const paymentPayload = {
      advocate_id: advocateId,
      case_id: caseId,
      amount: parseFloat(amount),
      date,
      description,
      status: requestedFromClient ? 'Requested' : 'Paid',
      requested_from_client: requestedFromClient,
      client_access_token: caseRecord?.client_access_token || '',
    };

    const paymentRef = await addDoc(collection(db, 'payments'), paymentPayload);

    if (caseRecord?.client_access_token) {
      await syncCaseAccessPayment(caseRecord.client_access_token, paymentPayload, paymentRef.id);
    }

    setCaseId('');
    setAmount('');
    setDate('');
    setDescription('');
    setRequestedFromClient(true);
    await fetchPayments();
  };

  return (
    <PageShell title={t('payments')} subtitle={t('paymentsSubtitle')} showBack>
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
      <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('feeEntry')}</p>
            <h2>{t('addPayment')}</h2>
          </div>
        </div>
        <form onSubmit={handleAddPayment}>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('caseId')}:</label>
              <input type="text" placeholder={t('linkedCaseNumber')} value={caseId} onChange={(e) => setCaseId(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('amount')}:</label>
              <input type="number" placeholder={t('amountInInr')} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('date')}:</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('description')}:</label>
              <input type="text" placeholder={t('paymentPurpose')} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('clientAction')}:</label>
              <select value={requestedFromClient ? 'request' : 'recorded'} onChange={(e) => setRequestedFromClient(e.target.value === 'request')}>
                <option value="request">{t('requestClientPayment')}</option>
                <option value="recorded">{t('recordReceivedPayment')}</option>
              </select>
            </div>
          </div>
          <button type="submit" className="button">{t('addPayment')}</button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('collections')}</p>
            <h2>{payments.length} {t('entries')}</h2>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="empty-state">{t('paymentsEmpty')}</p>
        ) : (
          <div className="record-list">
            {payments.map((payment) => (
              <article key={payment.id} className="record-item">
                <div>
                  <strong>{payment.case_id}</strong>
                  <p>{payment.description || t('noDescriptionAdded')}</p>
                </div>
                <span className="badge">{formatCurrency(payment.amount)} | {payment.status || t('paid')}</span>
              </article>
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </PageShell>
  );
};

export default Payments;
