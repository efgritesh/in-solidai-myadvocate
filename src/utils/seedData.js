import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const formatDate = (date) => date.toISOString().split('T')[0];

const dateAfter = (days) => {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);
  return formatDate(nextDate);
};

const sampleClients = (advocateId) => [
  {
    advocate_id: advocateId,
    name: 'Aarav Mehta',
    phone: '9876543210',
    email: 'aarav.mehta@example.com',
  },
  {
    advocate_id: advocateId,
    name: 'Neha Sharma',
    phone: '9822012345',
    email: 'neha.sharma@example.com',
  },
  {
    advocate_id: advocateId,
    name: 'Rohan Iyer',
    phone: '9811198111',
    email: 'rohan.iyer@example.com',
  },
];

const sampleCases = (advocateId) => [
  {
    advocate_id: advocateId,
    case_number: 'DEL-CIV-204/2026',
    client_name: 'Aarav Mehta',
    status: 'Open',
    court: 'Delhi District Court',
  },
  {
    advocate_id: advocateId,
    case_number: 'BLR-FAM-118/2026',
    client_name: 'Neha Sharma',
    status: 'Pending',
    court: 'Family Court Bengaluru',
  },
  {
    advocate_id: advocateId,
    case_number: 'MUM-COM-077/2026',
    client_name: 'Rohan Iyer',
    status: 'Open',
    court: 'Commercial Court Mumbai',
  },
];

const sampleHearings = (advocateId) => [
  {
    advocate_id: advocateId,
    case_id: 'DEL-CIV-204/2026',
    date: dateAfter(1),
    description: 'Reply filing and interim relief hearing',
  },
  {
    advocate_id: advocateId,
    case_id: 'BLR-FAM-118/2026',
    date: dateAfter(3),
    description: 'Counselling progress review',
  },
  {
    advocate_id: advocateId,
    case_id: 'MUM-COM-077/2026',
    date: dateAfter(5),
    description: 'Arguments on maintainability',
  },
];

const samplePayments = (advocateId) => [
  {
    advocate_id: advocateId,
    case_id: 'DEL-CIV-204/2026',
    amount: 25000,
    date: dateAfter(-5),
    description: 'Drafting and filing fee',
  },
  {
    advocate_id: advocateId,
    case_id: 'BLR-FAM-118/2026',
    amount: 12000,
    date: dateAfter(-2),
    description: 'Consultation and appearance',
  },
  {
    advocate_id: advocateId,
    case_id: 'MUM-COM-077/2026',
    amount: 18000,
    date: dateAfter(-1),
    description: 'Research and preparation',
  },
];

const collectionsToSeed = (advocateId) => [
  { name: 'clients', records: sampleClients(advocateId) },
  { name: 'cases', records: sampleCases(advocateId) },
  { name: 'hearings', records: sampleHearings(advocateId) },
  { name: 'payments', records: samplePayments(advocateId) },
];

export const seedAdvocateData = async (advocateId) => {
  if (!advocateId) return;

  const seedKey = `seeded_${advocateId}_v2`;
  if (localStorage.getItem(seedKey) === 'true') return;

  for (const entry of collectionsToSeed(advocateId)) {
    const collectionRef = collection(db, entry.name);
    const snapshot = await getDocs(query(collectionRef, where('advocate_id', '==', advocateId)));

    if (snapshot.empty) {
      for (const record of entry.records) {
        await addDoc(collectionRef, record);
      }
    }
  }

  localStorage.setItem(seedKey, 'true');
};
