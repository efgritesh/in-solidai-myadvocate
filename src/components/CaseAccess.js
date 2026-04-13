import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { useParams } from 'react-router-dom';
import { db, storage } from '../firebase';
import LanguageSelector from './LanguageSelector';
import { getStoredClientLanguage } from '../utils/language';
import { DocumentsIcon, PaymentsIcon, ShareIcon } from './AppIcons';

const formatTimelineMonth = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-');
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
      new Date(Number(year), Number(month) - 1, 1)
    );
  }
  return value;
};

const CaseAccess = () => {
  const { t, i18n } = useTranslation();
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
      const accessSnap = await getDoc(doc(db, 'client_access', token));
      if (!accessSnap.exists()) {
        setStatus('not_found');
        return;
      }

      const nextCase = { id: accessSnap.id, ...accessSnap.data() };
      if (!nextCase.enabled || nextCase.status === 'Closed') {
        setCaseRecord(nextCase);
        setStatus('closed');
        return;
      }

      const [paymentsSnap, documentsSnap, commentsSnap] = await Promise.all([
        getDocs(collection(db, 'client_access', token, 'payments')),
        getDocs(collection(db, 'client_access', token, 'documents')),
        getDocs(collection(db, 'client_access', token, 'comments')),
      ]);

      setCaseRecord(nextCase);
      setPayments(paymentsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setDocuments(documentsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setComments(commentsSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      setStatus('ready');
    } catch (error) {
      setStatus('not_found');
      setErrorMessage(error.message || t('invalidClientLink'));
    }
  }, [t, token]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  useEffect(() => {
    if (!caseRecord) return;
    const preferredLanguage =
      getStoredClientLanguage(token) || caseRecord.client_language || caseRecord.advocate_language || 'en';
    if (i18n.language !== preferredLanguage) {
      i18n.changeLanguage(preferredLanguage);
    }
  }, [caseRecord, i18n, token]);

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
      const storageRef = ref(storage, `client-access/${token}/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'client_access', token, 'documents'), {
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

    await addDoc(collection(db, 'client_access', token, 'comments'), {
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

    await addDoc(collection(db, 'client_access', token, 'payments'), {
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
          <h1>{t('loadingCaseAccess')}</h1>
          <p className="auth-subtitle">{t('openingClientView')}</p>
        </div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>{t('linkNotFound')}</h1>
          <p className="auth-subtitle">
            {errorMessage || t('invalidClientLink')}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>{t('caseAccessClosed')}</h1>
          <p className="auth-subtitle">
            {t('caseAccessClosedSubtitle')}
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
                <p className="eyebrow">{t('clientCaseAccess')}</p>
                <h1>{caseRecord.case_number}</h1>
                <p className="screen-subtitle">
                  {t('clientCaseAccessSubtitle')}
                </p>
              </div>
              <LanguageSelector token={token} mode="client" className="public-language-selector" />
            </div>
          </div>
        </header>

        <main className="stack">
          <section className="hero-card case-hero case-hero--public">
            <div>
              <p className="eyebrow">{t('caseSummary')}</p>
              <h2>{caseRecord.client_name}</h2>
              <p>{caseRecord.summary || t('noSummaryAdded')}</p>
            </div>
            <div className="case-hero__meta">
              <span className="badge">{caseRecord.status}</span>
              <span className="case-hero__progress">{caseRecord.next_step || t('nextStepSoon')}</span>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('matterBrief')}</p>
                <h2>{t('importantDetails')}</h2>
              </div>
            </div>
            <div className="details-grid">
              <article className="record-item">
                <div>
                  <strong>{t('court')}</strong>
                  <p>{caseRecord.court || t('notAdded')}</p>
                </div>
              </article>
              <article className="record-item">
                <div>
                  <strong>{t('nextStepShort')}</strong>
                  <p>{caseRecord.next_step || t('nextStepSoon')}</p>
                </div>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('progressTracker')}</p>
                <h2>{t('caseLifecycle')}</h2>
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
                        ? `Recorded ${formatTimelineMonth(step.eta) || 'timeline reached'}`
                        : `Tentative ${formatTimelineMonth(step.eta) || 'date to be updated'}`}
                    </span>
                    <p>
                      {step.status === 'done'
                        ? t('completedRecordedByAdvocate')
                        : step.status === 'in_progress'
                          ? t('currentlyActiveInCase')
                          : t('upcomingCaseJourney')}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('fees')}</p>
                <h2>{t('requestedSubmittedPayments')}</h2>
              </div>
              <PaymentsIcon className="app-icon section-icon" />
            </div>
            <div className="record-list">
              {requestedPayments.map((payment) => (
                <article key={payment.id} className="record-item">
                  <div>
                    <strong>{payment.description}</strong>
                    <p>{payment.stage || t('caseFee')} | {payment.date}</p>
                  </div>
                  <span className="badge">{payment.status}</span>
                </article>
              ))}
            </div>
            <form onSubmit={handlePaymentSubmit} className="top-space">
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('amountPaid')}:</label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((current) => ({ ...current, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('paymentNote')}:</label>
                  <input
                    type="text"
                    placeholder={t('paymentNotePlaceholder')}
                    value={paymentForm.description}
                    onChange={(e) => setPaymentForm((current) => ({ ...current, description: e.target.value }))}
                  />
                </div>
              </div>
              <button type="submit" className="button">{t('submitPaymentUpdate')}</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('documents')}</p>
                <h2>{t('sharedFilesUploads')}</h2>
              </div>
              <DocumentsIcon className="app-icon section-icon" />
            </div>
            <div className="record-list">
              {documents.map((docItem) => (
                <article key={docItem.id} className="record-item">
                  <div>
                    <strong>{docItem.name}</strong>
                    <p>{docItem.type} | {docItem.uploaded_by_role || t('shared')}</p>
                  </div>
                  <a className="inline-link" href={docItem.url} target="_blank" rel="noopener noreferrer">
                    {t('open')}
                  </a>
                </article>
              ))}
            </div>
            <div className="dropzone top-space" {...getRootProps()}>
              <input {...getInputProps()} />
              <p>{t('tapToUploadCaseDoc')}</p>
              <small>{t('clientUploadHint')}</small>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('comments')}</p>
                <h2>{t('updatesQuestions')}</h2>
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
                <label>{t('addMessageForAdvocate')}:</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} required />
              </div>
              <button type="submit" className="button">{t('sendMessage')}</button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
};

export default CaseAccess;
