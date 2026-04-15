import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

const accessDoc = (token) => doc(db, 'client_access', token);
const accessCollection = (token, name) => collection(db, 'client_access', token, name);

const buildAccessSnapshot = (caseRecord) => ({
  advocate_id: caseRecord.advocate_id,
  case_id: caseRecord.id || '',
  case_number: caseRecord.case_number,
  client_name: caseRecord.client_name || '',
  client_email: caseRecord.client_email || '',
  client_phone: caseRecord.client_phone || '',
  advocate_language: caseRecord.advocate_language || 'en',
  client_language: caseRecord.client_language || caseRecord.advocate_language || 'en',
  status: caseRecord.status || 'Open',
  enabled: caseRecord.client_access_enabled !== false,
  summary: caseRecord.summary || '',
  next_step: caseRecord.next_step || '',
  lifecycle: caseRecord.lifecycle || [],
  court: caseRecord.court || '',
  updated_at: new Date().toISOString(),
});

export const syncCaseAccessRecord = async (caseRecord) => {
  const token = caseRecord?.client_access_token;
  if (!token) return;

  await setDoc(accessDoc(token), buildAccessSnapshot(caseRecord), { merge: true });
};

export const syncCaseAccessPayment = async (token, paymentRecord, id) => {
  if (!token || !id) return;

  await setDoc(doc(db, 'client_access', token, 'payments', id), {
    advocate_id: paymentRecord.advocate_id,
    case_id: paymentRecord.case_id,
    amount: paymentRecord.amount || 0,
    date: paymentRecord.date || '',
    description: paymentRecord.description || '',
    stage: paymentRecord.stage || '',
    status: paymentRecord.status || '',
    requested_from_client: !!paymentRecord.requested_from_client,
    source_role: paymentRecord.uploaded_by_role || paymentRecord.author_role || (paymentRecord.status === 'Client Submitted' ? 'client' : 'advocate'),
    synced_at: new Date().toISOString(),
  }, { merge: true });
};

export const syncCaseAccessDocument = async (token, documentRecord, id) => {
  if (!token || !id) return;

  await setDoc(doc(db, 'client_access', token, 'documents', id), {
    advocate_id: documentRecord.advocate_id,
    case_id: documentRecord.case_id,
    type: documentRecord.type || '',
    url: documentRecord.url || '',
    name: documentRecord.name || '',
    uploaded_by_role: documentRecord.uploaded_by_role || 'advocate',
    storage_path: documentRecord.storage_path || '',
    mime_type: documentRecord.mime_type || '',
    source_drafting_output_id: documentRecord.source_drafting_output_id || '',
    source_drafting_session_id: documentRecord.source_drafting_session_id || '',
    synced_at: new Date().toISOString(),
  }, { merge: true });
};

export const syncCaseAccessComment = async (token, commentRecord, id) => {
  if (!token || !id) return;

  await setDoc(doc(db, 'client_access', token, 'comments', id), {
    advocate_id: commentRecord.advocate_id,
    case_id: commentRecord.case_id,
    author_role: commentRecord.author_role || 'advocate',
    author_name: commentRecord.author_name || '',
    message: commentRecord.message || '',
    created_at: commentRecord.created_at || new Date().toISOString(),
    synced_at: new Date().toISOString(),
  }, { merge: true });
};

export const removeCaseAccessCollections = async (token) => {
  if (!token) return;

  for (const name of ['payments', 'documents', 'comments']) {
    const snapshot = await getDocs(accessCollection(token, name));
    await Promise.all(snapshot.docs.map((docItem) => deleteDoc(docItem.ref)));
  }
};

export const syncAdvocateClientAccess = async (advocateId) => {
  if (!advocateId) return;

  const [casesSnap, paymentsSnap, documentsSnap, commentsSnap] = await Promise.all([
    getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'documents'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'comments'), where('advocate_id', '==', advocateId))),
  ]);

  const cases = casesSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
  const tokenByCaseNumber = new Map(cases.map((caseRecord) => [caseRecord.case_number, caseRecord.client_access_token]));

  await Promise.all(cases.map((caseRecord) => syncCaseAccessRecord(caseRecord)));

  for (const paymentDoc of paymentsSnap.docs) {
    const payment = paymentDoc.data();
    const token = payment.client_access_token || tokenByCaseNumber.get(payment.case_id);
    if (token) {
      await syncCaseAccessPayment(token, payment, paymentDoc.id);
    }
  }

  for (const documentDoc of documentsSnap.docs) {
    const documentRecord = documentDoc.data();
    const token = documentRecord.client_access_token || tokenByCaseNumber.get(documentRecord.case_id);
    if (token) {
      await syncCaseAccessDocument(token, documentRecord, documentDoc.id);
    }
  }

  for (const commentDoc of commentsSnap.docs) {
    const comment = commentDoc.data();
    const token = comment.client_access_token || tokenByCaseNumber.get(comment.case_id);
    if (token) {
      await syncCaseAccessComment(token, comment, commentDoc.id);
    }
  }
};
