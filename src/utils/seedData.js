import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { createCaseAccessToken } from './caseAccess';
import {
  syncAdvocateClientAccess,
  syncCaseAccessComment,
  syncCaseAccessDocument,
  syncCaseAccessPayment,
  syncCaseAccessRecord,
} from './clientAccessRecords';
import { createLifecycleStep } from './lifecycle';

const formatDate = (date) => date.toISOString().split('T')[0];

const dateAfter = (days) => {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);
  return formatDate(nextDate);
};

const buildLifecycle = (overrides = {}) => [
  createLifecycleStep({
    id: 'consultation',
    title: 'Initial consultation',
    eta: overrides.consultationEta || '2026-04',
    status: overrides.consultation || 'done',
  }),
  createLifecycleStep({
    id: 'drafting',
    title: 'Draft petition and evidence set',
    eta: overrides.draftingEta || '2026-05',
    status: overrides.drafting || 'in_progress',
  }),
  createLifecycleStep({
    id: 'filing',
    title: 'File before court',
    eta: overrides.filingEta || '2026-06',
    status: overrides.filing || 'pending',
  }),
  createLifecycleStep({
    id: 'hearing',
    title: overrides.hearingTitle || 'Interim relief hearing',
    eta: overrides.hearingEta || '2026-07',
    status: overrides.hearing || 'pending',
    stageType: 'hearing',
    scheduledDate: overrides.hearingDate || '',
    notes: overrides.hearingNotes || '',
  }),
  createLifecycleStep({
    id: 'closure',
    title: 'Order follow-up and closure',
    eta: overrides.closureEta || '2026-08',
    status: overrides.closure || 'pending',
  }),
];

const advocateClients = (advocateId) => [
  {
    advocate_id: advocateId,
    name: 'Aarav Mehta',
    phone: '9876543210',
    email: 'aarav.mehta@example.com',
    preferredLanguage: 'en',
    relationLabel: 'S/o',
    relationName: 'Rajesh Mehta',
    age: '34',
    dateOfBirth: '1992-08-11',
    gender: 'Male',
    address: '17 Green Park, New Delhi',
    aadhaarName: 'Aarav Rajesh Mehta',
    aadhaarNumber: '9876 5432 1012',
  },
  {
    advocate_id: advocateId,
    name: 'Neha Sharma',
    phone: '9822012345',
    email: 'neha.sharma@example.com',
    preferredLanguage: 'hi',
    relationLabel: 'D/o',
    relationName: 'Vikram Sharma',
    age: '31',
    dateOfBirth: '1995-01-24',
    gender: 'Female',
    address: '22 Indiranagar, Bengaluru',
    aadhaarName: 'Neha Vikram Sharma',
    aadhaarNumber: '8765 4321 1002',
  },
  {
    advocate_id: advocateId,
    name: 'Rohan Iyer',
    phone: '9811198111',
    email: 'rohan.iyer@example.com',
    preferredLanguage: 'en',
    relationLabel: 'S/o',
    relationName: 'Sridhar Iyer',
    age: '39',
    dateOfBirth: '1987-04-03',
    gender: 'Male',
    address: '5 Marine Drive, Mumbai',
    aadhaarName: 'Rohan Sridhar Iyer',
    aadhaarNumber: '7654 3210 9988',
  },
];

const advocateCases = (advocateId) => [
  {
    advocate_id: advocateId,
    case_number: 'DEL-CIV-204/2026',
    client_name: 'Aarav Mehta',
    client_email: 'aarav.mehta@example.com',
    client_phone: '9876543210',
    advocate_language: 'en',
    client_language: 'en',
    status: 'Open',
    court: 'Delhi District Court',
    place: 'New Delhi',
    police_station: 'Connaught Place',
    summary: 'Civil recovery matter involving unpaid commercial dues and interim relief.',
    next_step: 'File reply bundle and supporting invoice set.',
    lifecycle: buildLifecycle({
      consultation: 'done',
      drafting: 'done',
      filing: 'in_progress',
      hearingDate: dateAfter(1),
      hearingNotes: 'Reply filing and interim relief hearing',
    }),
    client_access_token: createCaseAccessToken('DEL-CIV-204/2026'),
    client_access_enabled: true,
  },
  {
    advocate_id: advocateId,
    case_number: 'BLR-FAM-118/2026',
    client_name: 'Neha Sharma',
    client_email: 'neha.sharma@example.com',
    client_phone: '9822012345',
    advocate_language: 'en',
    client_language: 'hi',
    status: 'Pending',
    court: 'Family Court Bengaluru',
    place: 'Bengaluru',
    police_station: 'Indiranagar',
    summary: 'Family matter currently at counselling and settlement review stage.',
    next_step: 'Collect counselling note and update filing pack.',
    lifecycle: buildLifecycle({
      consultation: 'done',
      drafting: 'in_progress',
      hearingTitle: 'Counselling progress hearing',
      hearingDate: dateAfter(3),
      hearingNotes: 'Counselling progress review',
    }),
    client_access_token: createCaseAccessToken('BLR-FAM-118/2026'),
    client_access_enabled: true,
  },
  {
    advocate_id: advocateId,
    case_number: 'MUM-COM-077/2026',
    client_name: 'Rohan Iyer',
    client_email: 'rohan.iyer@example.com',
    client_phone: '9811198111',
    advocate_language: 'en',
    client_language: 'en',
    status: 'Open',
    court: 'Commercial Court Mumbai',
    place: 'Mumbai',
    police_station: 'Marine Drive',
    summary: 'Commercial dispute with current hearing preparation underway.',
    next_step: 'Prepare final argument note and chronology.',
    lifecycle: buildLifecycle({
      consultation: 'done',
      drafting: 'done',
      filing: 'done',
      hearing: 'in_progress',
      hearingTitle: 'Arguments hearing',
      hearingDate: dateAfter(5),
      hearingNotes: 'Arguments on maintainability',
    }),
    client_access_token: createCaseAccessToken('MUM-COM-077/2026'),
    client_access_enabled: true,
  },
];

const advocatePayments = (advocateId, cases) => [
  {
    advocate_id: advocateId,
    case_id: 'DEL-CIV-204/2026',
    amount: 25000,
    date: dateAfter(-5),
    description: 'Drafting and filing fee',
    stage: 'Filing',
    status: 'Paid',
    requested_from_client: true,
    client_access_token: cases[0].client_access_token,
  },
  {
    advocate_id: advocateId,
    case_id: 'BLR-FAM-118/2026',
    amount: 12000,
    date: dateAfter(-2),
    description: 'Consultation and appearance',
    stage: 'Consultation',
    status: 'Paid',
    requested_from_client: true,
    client_access_token: cases[1].client_access_token,
  },
  {
    advocate_id: advocateId,
    case_id: 'MUM-COM-077/2026',
    amount: 18000,
    date: dateAfter(2),
    description: 'Arguments preparation milestone',
    stage: 'Arguments',
    status: 'Requested',
    requested_from_client: true,
    client_access_token: cases[2].client_access_token,
  },
];

const advocateDocuments = (advocateId, cases) => [
  {
    advocate_id: advocateId,
    case_id: 'DEL-CIV-204/2026',
    type: 'Affidavit',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    name: 'draft-affidavit.pdf',
    uploaded_by_role: 'advocate',
    client_access_token: cases[0].client_access_token,
  },
  {
    advocate_id: advocateId,
    case_id: 'BLR-FAM-118/2026',
    type: 'Client ID Proof',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    name: 'id-proof.pdf',
    uploaded_by_role: 'advocate',
    client_access_token: cases[1].client_access_token,
  },
];

const advocateComments = (advocateId, cases) => [
  {
    advocate_id: advocateId,
    case_id: 'DEL-CIV-204/2026',
    author_role: 'advocate',
    author_name: 'Advocate',
    message: 'Please review the draft affidavit shared in the documents section.',
    created_at: `${dateAfter(-1)}T10:00:00.000Z`,
    client_access_token: cases[0].client_access_token,
  },
  {
    advocate_id: advocateId,
    case_id: 'MUM-COM-077/2026',
    author_role: 'advocate',
    author_name: 'Advocate',
    message: 'Filing is complete. We are preparing the next hearing brief.',
    created_at: `${dateAfter(0)}T11:00:00.000Z`,
    client_access_token: cases[2].client_access_token,
  },
];

const adminAlerts = (adminId) => [
  {
    admin_id: adminId,
    title: 'Storage review due',
    detail: 'Document storage crossed 68 percent of the current quota.',
    severity: 'Medium',
  },
  {
    admin_id: adminId,
    title: 'Auth provider check',
    detail: 'Google sign-in enabled for testing accounts.',
    severity: 'Info',
  },
];

const legacyDemoClientNames = ['Aarav Mehta', 'Neha Sharma', 'Rohan Iyer'];
const legacyDemoCaseNumbers = ['DEL-CIV-204/2026', 'BLR-FAM-118/2026', 'MUM-COM-077/2026'];

const deleteDocs = async (docs = []) => {
  await Promise.all(docs.map((item) => deleteDoc(item.ref)));
};

const clearClientAccessToken = async (token) => {
  if (!token) return;

  const paymentDocs = await getDocs(collection(db, 'client_access', token, 'payments'));
  const documentDocs = await getDocs(collection(db, 'client_access', token, 'documents'));
  const commentDocs = await getDocs(collection(db, 'client_access', token, 'comments'));

  await Promise.all([
    deleteDocs(paymentDocs.docs),
    deleteDocs(documentDocs.docs),
    deleteDocs(commentDocs.docs),
  ]);

  await deleteDoc(doc(db, 'client_access', token));
};

const seedCollectionIfEmpty = async (collectionName, fieldName, fieldValue, records) => {
  const collectionRef = collection(db, collectionName);
  const snapshot = await getDocs(query(collectionRef, where(fieldName, '==', fieldValue)));

  if (snapshot.empty) {
    const docs = [];
    for (const record of records) {
      const docRef = await addDoc(collectionRef, record);
      docs.push({ id: docRef.id, ...record });
    }
    return docs;
  }

  return snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
};

export const seedAdvocateData = async (advocateId) => {
  if (!advocateId) return;

const seedKey = `seeded_${advocateId}_advocate_v8`;
  if (localStorage.getItem(seedKey) === 'true') return;

  const cases = advocateCases(advocateId);
  await seedCollectionIfEmpty('clients', 'advocate_id', advocateId, advocateClients(advocateId));
  const seededCases = await seedCollectionIfEmpty('cases', 'advocate_id', advocateId, cases);
  const seededPayments = await seedCollectionIfEmpty('payments', 'advocate_id', advocateId, advocatePayments(advocateId, cases));
  const seededDocuments = await seedCollectionIfEmpty('documents', 'advocate_id', advocateId, advocateDocuments(advocateId, cases));
  const seededComments = await seedCollectionIfEmpty('comments', 'advocate_id', advocateId, advocateComments(advocateId, cases));

  for (const caseRecord of seededCases) {
    await syncCaseAccessRecord(caseRecord);
  }

  for (const payment of seededPayments) {
    if (payment.client_access_token) {
      await syncCaseAccessPayment(payment.client_access_token, payment, payment.id);
    }
  }

  for (const documentRecord of seededDocuments) {
    if (documentRecord.client_access_token) {
      await syncCaseAccessDocument(documentRecord.client_access_token, documentRecord, documentRecord.id);
    }
  }

  for (const comment of seededComments) {
    if (comment.client_access_token) {
      await syncCaseAccessComment(comment.client_access_token, comment, comment.id);
    }
  }

  await syncAdvocateClientAccess(advocateId);

  localStorage.setItem(seedKey, 'true');
};

export const cleanupLegacyAdvocateDemoData = async (advocateId) => {
  if (!advocateId) return false;

  const cleanupKey = `cleanup_${advocateId}_legacy_demo_v1`;
  if (localStorage.getItem(cleanupKey) === 'true') return false;

  const [clientsSnapshot, casesSnapshot, paymentsSnapshot, documentsSnapshot, commentsSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'clients'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'payments'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'documents'), where('advocate_id', '==', advocateId))),
    getDocs(query(collection(db, 'comments'), where('advocate_id', '==', advocateId))),
  ]);

  const clientDocs = clientsSnapshot.docs.filter((item) => legacyDemoClientNames.includes(item.data().name));
  const caseDocs = casesSnapshot.docs.filter((item) => legacyDemoCaseNumbers.includes(item.data().case_number));
  const demoCaseNumbers = new Set(caseDocs.map((item) => item.data().case_number));
  const demoTokens = [...new Set(caseDocs.map((item) => item.data().client_access_token).filter(Boolean))];

  const paymentDocs = paymentsSnapshot.docs.filter((item) => demoCaseNumbers.has(item.data().case_id));
  const documentDocs = documentsSnapshot.docs.filter((item) => demoCaseNumbers.has(item.data().case_id));
  const commentDocs = commentsSnapshot.docs.filter((item) => demoCaseNumbers.has(item.data().case_id));

  const hasDemoData = clientDocs.length || caseDocs.length || paymentDocs.length || documentDocs.length || commentDocs.length;

  if (!hasDemoData) {
    localStorage.setItem(cleanupKey, 'true');
    return false;
  }

  await Promise.all([
    deleteDocs(paymentDocs),
    deleteDocs(documentDocs),
    deleteDocs(commentDocs),
    deleteDocs(caseDocs),
    deleteDocs(clientDocs),
    Promise.all(demoTokens.map((token) => clearClientAccessToken(token))),
  ]);

  localStorage.setItem(cleanupKey, 'true');
  return true;
};

export const seedAdminData = async (adminId) => {
  if (!adminId) return;

  const seedKey = `seeded_${adminId}_admin_v1`;
  if (localStorage.getItem(seedKey) === 'true') return;

  await seedCollectionIfEmpty('system_alerts', 'admin_id', adminId, adminAlerts(adminId));
  localStorage.setItem(seedKey, 'true');
};

export const ensureAdminUserDoc = async (adminUser) => {
  if (!adminUser?.uid) return;

  const userRef = doc(db, 'users', adminUser.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid: adminUser.uid,
      email: adminUser.email || '',
      role: 'admin',
      name: adminUser.displayName || 'System Admin',
      createdAt: new Date().toISOString(),
      profileComplete: true,
    });
  }
};
