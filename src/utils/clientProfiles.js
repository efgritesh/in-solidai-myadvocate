import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { auth, db, storage } from '../firebase';

const FUNCTIONS_BASE = 'https://asia-south1-in-solidai-myadvocate.cloudfunctions.net';

export const calculateAgeFromDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth) {
    return '';
  }

  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) {
    return '';
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? String(age) : '';
};

export const uploadClientAadhaarReference = async ({ advocateId, clientId, file }) => {
  if (!file) {
    return null;
  }

  const storagePath = `clients/${advocateId}/${clientId}/aadhaar/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return {
    aadhaarReferenceName: file.name,
    aadhaarReferencePath: storagePath,
    aadhaarReferenceUrl: url,
    aadhaarReferenceMimeType: file.type || 'application/octet-stream',
  };
};

export const uploadClientAadhaarIntake = async ({ advocateId, file }) => {
  if (!file) {
    return null;
  }

  const storagePath = `clients/${advocateId}/intake/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return {
    storagePath,
    url,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  };
};

export const extractAadhaarDetails = async ({ advocateId, file }) => {
  if (!advocateId || !file) {
    throw new Error('Aadhaar upload is required.');
  }

  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in to read Aadhaar details.');
  }

  const uploaded = await uploadClientAadhaarIntake({ advocateId, file });
  const response = await fetch(`${FUNCTIONS_BASE}/extractAadhaarDetailsHttp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(uploaded),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to read Aadhaar details.');
  }

  return {
    ...data,
    uploadedReference: uploaded,
  };
};

export const createClientProfile = async ({ advocateId, data, aadhaarFile = null }) => {
  const clientRef = await addDoc(collection(db, 'clients'), {
    advocate_id: advocateId,
    ...data,
  });

  if (aadhaarFile) {
    const aadhaarPayload = await uploadClientAadhaarReference({ advocateId, clientId: clientRef.id, file: aadhaarFile });
    await updateDoc(doc(db, 'clients', clientRef.id), aadhaarPayload);
  }

  return clientRef.id;
};

export const updateClientProfile = async ({ clientId, advocateId, data, aadhaarFile = null }) => {
  const patch = { ...data };

  if (aadhaarFile) {
    const aadhaarPayload = await uploadClientAadhaarReference({ advocateId, clientId, file: aadhaarFile });
    Object.assign(patch, aadhaarPayload);
  }

  await updateDoc(doc(db, 'clients', clientId), patch);
};
