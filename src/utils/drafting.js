import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';

const FUNCTIONS_BASE = 'https://asia-south1-in-solidai-myadvocate.cloudfunctions.net';

const postDraftingAction = async (endpoint, payload) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in to use AI drafting.');
  }

  const response = await fetch(`${FUNCTIONS_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Drafting request failed.');
  }

  return data;
};

export const draftingTypeOptions = [
  { value: 'legal_notice', label: 'Legal notice' },
  { value: 'reply_rejoinder', label: 'Reply / rejoinder' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'affidavit', label: 'Affidavit' },
  { value: 'written_statement', label: 'Written statement' },
  { value: 'bail_application', label: 'Bail application' },
  { value: 'agreement_draft', label: 'Agreement draft' },
  { value: 'petition', label: 'Petition' },
  { value: 'representation_application', label: 'Representation / application' },
  { value: 'submissions_argument_note', label: 'Submissions / argument note' },
  { value: 'custom', label: 'Custom' },
];

export const createDraftingSession = async (payload) => postDraftingAction('createDraftingSessionHttp', payload);
export const registerDraftingSource = async (payload) => postDraftingAction('registerDraftingSourceHttp', payload);
export const extractDraftingSources = async (payload) => postDraftingAction('extractDraftingSourcesHttp', payload);
export const generateDraftingOutput = async (payload) => postDraftingAction('generateDraftingOutputHttp', payload);
export const exportDraftingDocx = async (payload) => postDraftingAction('exportDraftingDocxHttp', payload);
export const publishDraftingOutput = async (payload) => postDraftingAction('publishDraftingOutputHttp', payload);

export const uploadDraftingFile = async ({ advocateId, sessionId, file }) => {
  const storagePath = `drafting/${advocateId}/sessions/${sessionId}/sources/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return {
    storagePath,
    url,
  };
};

export const getStorageUrl = async (storagePath) => {
  if (!storagePath) {
    return '';
  }
  return getDownloadURL(ref(storage, storagePath));
};
