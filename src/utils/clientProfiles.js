import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';

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

