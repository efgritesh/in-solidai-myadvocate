import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { functions, storage } from '../firebase';

const createSessionCallable = httpsCallable(functions, 'createDraftingSession');
const registerSourceCallable = httpsCallable(functions, 'registerDraftingSource');
const extractSourcesCallable = httpsCallable(functions, 'extractDraftingSources');
const generateOutputCallable = httpsCallable(functions, 'generateDraftingOutput');
const exportDocxCallable = httpsCallable(functions, 'exportDraftingDocx');
const publishOutputCallable = httpsCallable(functions, 'publishDraftingOutput');

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

export const createDraftingSession = async (payload) => {
  const response = await createSessionCallable(payload);
  return response.data;
};

export const registerDraftingSource = async (payload) => {
  const response = await registerSourceCallable(payload);
  return response.data;
};

export const extractDraftingSources = async (payload) => {
  const response = await extractSourcesCallable(payload);
  return response.data;
};

export const generateDraftingOutput = async (payload) => {
  const response = await generateOutputCallable(payload);
  return response.data;
};

export const exportDraftingDocx = async (payload) => {
  const response = await exportDocxCallable(payload);
  return response.data;
};

export const publishDraftingOutput = async (payload) => {
  const response = await publishOutputCallable(payload);
  return response.data;
};

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
