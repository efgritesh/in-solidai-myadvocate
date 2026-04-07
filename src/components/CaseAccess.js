import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useDropzone } from 'react-dropzone';
import { useParams } from 'react-router-dom';
import { db, storage } from '../firebase';
import { DocumentsIcon, PaymentsIcon, ShareIcon } from './AppIcons';

const CaseAccess = () => {
  const { token } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [payments, setPayments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', description: '' });
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const loadCase = useCallback(async () => {
    if (!token) return;
    setErrorMessage('');

    try {
      const caseSnap = await getDocs(query(collection(db, 'cases'), where('client_access_token', '==', token)));
      if (caseSnap.empty) {
        setStatus('not_found');
        return;
      }

      const nextCase = { id: caseSnap.docs[0].id, ...caseSnap.docs[0].data() };
      if (!nextCase.client_access_enabled || nextCase.status === 'Closed') {
        setCaseRecord(nextCase);
        setStatus('closed');
        return;
      }

      const [paymentsSnap, documentsSnap, commentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'payments'), where('client_access_token', '==', token))),
        getDocs(query(collection(db, 'documents'), where('client_access_token', '==', token))),
        getDocs(query(collection(db, 'comments'), where('client_access_token', '==', token))),
      ]);

      setCaseRecord(nextCase);
      setPayments(paymentsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setDocuments(documentsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setComments(commentsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setStatus('ready');
    } catch (error) {
      setStatus('not_found');
      setErrorMessage(error.message || 'Unable to load this case right now.');
    }
  }, [token]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const requestedPayments = useMemo(
    () => payments.filter((payment) => payment.requested_from_client || payment.status === 'Requested' || payment.status === 'Paid'),
    [payments]
  );

  const timelineSteps = useMemo(
    () =>
      (caseRecord?.lifecycle || []).map((step, index, source) => ({
        ...step,
        index,
        isLast: index === source.length - 1,
      })),
    [caseRecord]
  );

  const onDrop = async (acceptedFiles) => {
    if (!caseRecord) return;

    for (const file of acceptedFiles) {
      const storageRef = ref(storage, `case-access/${caseRecord.case_number}/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        advocate_id: caseRecord.advocate_id,
        case_id: caseRecord.case_number,
        type: 'Client Upload',
        url,
        name: file.name,
        uploaded_by_role: 'client',
        client_access_token: token,
      });
    }

    await loadCase();
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!caseRecord || !comment.trim()) return;

    await addDoc(collection(db, 'comments'), {
      advocate_id: caseRecord.advocate_id,
      case_id: caseRecord.case_number,
      author_role: 'client',
      author_name: caseRecord.client_name || 'Client',
      message: comment.trim(),
      created_at: new Date().toISOString(),
      client_access_token: token,
    });

    setComment('');
    await loadCase();
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!caseRecord) return;

    await addDoc(collection(db, 'payments'), {
      advocate_id: caseRecord.advocate_id,
      case_id: caseRecord.case_number,
      amount: parseFloat(paymentForm.amount),
      date: new Date().toISOString().split('T')[0],
      description: paymentForm.description || 'Client marked payment as submitted',
      stage: 'Client submission',
      status: 'Client Submitted',
      requested_from_client: false,
      client_access_token: token,
    });

    setPaymentForm({ amount: '', description: '' });
    await loadCase();
  };

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Loading case access</h1>
          <p className="auth-subtitle">Opening the client view for this case link.</p>
        </div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Link not found</h1>
          <p className="auth-subtitle">
            {errorMessage || 'This client access link is invalid or no longer exists.'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Case access closed</h1>
          <p className="auth-subtitle">
            This link is no longer active because the case has been concluded or client access was disabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="page-frame page-frame--public">
        <header className="screen-header">
          <div className="screen-header__content">
            <div className="public-hero">
              <img
                className="public-hero__logo"
                src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
                alt="Supreme Court of India emblem"
              />
              <div>
                <p className="eyebrow">Client case access</p>
                <h1>{caseRecord.case_number}</h1>
                <p className="screen-subtitle">
                  Shared by your advocate for reviewing progress, payments, documents, and updates relevant to your matter.
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="stack">
          <section className="hero-card case-hero case-hero--public">
            <div>
              <p className="eyebrow">Case summary</p>
              <h2>{caseRecord.client_name}</h2>
              <p>{caseRecord.summary || 'No summary added yet.'}</p>
            </div>
            <div className="case-hero__meta">
              <span className="badge">{caseRecord.status}</span>
              <span className="case-hero__progress">{caseRecord.next_step || 'Next update will appear here.'}</span>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Matter brief</p>
                <h2>Important details</h2>
              </div>
            </div>
            <div className="details-grid">
              <article className="record-item">
                <div>
                  <strong>Court</strong>
                  <p>{caseRecord.court || 'Not added'}</p>
                </div>
              </article>
              <article className="record-item">
                <div>
                  <strong>Next step</strong>
                  <p>{caseRecord.next_step || 'Your advocate will update the next step shortly.'}</p>
                </div>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Progress tracker</p>
                <h2>Case lifecycle</h2>
              </div>
            </div>
            <div className="timeline">
              {timelineSteps.map((step, index) => (
                <article key={step.id} className={`timeline-step timeline-step--${step.status}`}>
                  <div className="timeline-step__rail">
                    <span className="timeline-step__dot">{index + 1}</span>
                    {!step.isLast ? <span className="timeline-step__line" /> : null}
                  </div>
                  <div className="timeline-step__body">
                    <strong>{step.title}</strong>
                    <span className="timeline-step__eta">
                      {step.status === 'done'
                        ? `Recorded ${step.eta || 'timeline reached'}`
                        : `Tentative ${step.eta || 'date to be updated'}`}
                    </span>
                    <p>
                      {step.status === 'done'
                        ? 'Completed and recorded by your advocate.'
                        : step.status === 'in_progress'
                          ? 'Currently active in your case.'
                          : 'Upcoming in the case journey.'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Fees</p>
                <h2>Requested and submitted payments</h2>
              </div>
              <PaymentsIcon className="app-icon section-icon" />
            </div>
            <div className="record-list">
              {requestedPayments.map((payment) => (
                <article key={payment.id} className="record-item">
                  <div>
                    <strong>{payment.description}</strong>
                    <p>{payment.stage || 'Case fee'} | {payment.date}</p>
                  </div>
                  <span className="badge">{payment.status}</span>
                </article>
              ))}
            </div>
            <form onSubmit={handlePaymentSubmit} className="top-space">
              <div className="form-grid">
                <div className="form-group">
                  <label>Amount paid:</label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((current) => ({ ...current, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Payment note:</label>
                  <input
                    type="text"
                    placeholder="Reference, UPI note, or stage"
                    value={paymentForm.description}
                    onChange={(e) => setPaymentForm((current) => ({ ...current, description: e.target.value }))}
                  />
                </div>
              </div>
              <button type="submit" className="button">Submit payment update</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Documents</p>
                <h2>Shared files and uploads</h2>
              </div>
              <DocumentsIcon className="app-icon section-icon" />
            </div>
            <div className="record-list">
              {documents.map((docItem) => (
                <article key={docItem.id} className="record-item">
                  <div>
                    <strong>{docItem.name}</strong>
                    <p>{docItem.type} | {docItem.uploaded_by_role || 'shared'}</p>
                  </div>
                  <a className="inline-link" href={docItem.url} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                </article>
              ))}
            </div>
            <div className="dropzone top-space" {...getRootProps()}>
              <input {...getInputProps()} />
              <p>Tap to upload a document or image for this case</p>
              <small>Your advocate will be able to review this upload inside the case records.</small>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Comments</p>
                <h2>Updates and questions</h2>
              </div>
              <ShareIcon className="app-icon section-icon" />
            </div>
            <div className="record-list">
              {comments.map((commentItem) => (
                <article key={commentItem.id} className="record-item record-item--stack">
                  <div>
                    <strong>{commentItem.author_name || commentItem.author_role}</strong>
                    <p>{commentItem.message}</p>
                  </div>
                  <span className="badge">{commentItem.author_role}</span>
                </article>
              ))}
            </div>
            <form onSubmit={handleCommentSubmit} className="top-space">
              <div className="form-group">
                <label>Add a message for your advocate:</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} required />
              </div>
              <button type="submit" className="button">Send message</button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
};

export default CaseAccess;
