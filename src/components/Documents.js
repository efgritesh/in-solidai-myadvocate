import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import PageShell from './PageShell';

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [type, setType] = useState('');

  const fetchDocuments = async () => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    const querySnapshot = await getDocs(query(collection(db, 'documents'), where('advocate_id', '==', advocateId)));
    setDocuments(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const onDrop = async (acceptedFiles) => {
    const advocateId = auth.currentUser?.uid;
    if (!advocateId) return;
    if (!caseId || !type) {
      alert('Add a case ID and document type before uploading.');
      return;
    }

    for (const file of acceptedFiles) {
      const storageRef = ref(storage, `documents/${advocateId}/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        advocate_id: advocateId,
        case_id: caseId,
        type,
        url,
        name: file.name,
      });
    }

    await fetchDocuments();
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <PageShell
      title="Documents"
      subtitle="Upload matter files with large touch targets and quick access links."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload prep</p>
            <h2>Document details</h2>
          </div>
        </div>
        <form>
          <div className="form-grid">
            <div className="form-group">
              <label>Case ID:</label>
              <input
                type="text"
                placeholder="Linked case number"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Type:</label>
              <input
                type="text"
                placeholder="Affidavit, Notice, Vakalatnama..."
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
            </div>
          </div>
        </form>
        <div className="dropzone" {...getRootProps()}>
          <input {...getInputProps()} />
          <p>Tap to upload or drag files here</p>
          <small>PDFs, images, and notes can be attached to the selected matter.</small>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2>{documents.length} files</h2>
          </div>
        </div>
        {documents.length === 0 ? (
          <p className="empty-state">No documents uploaded yet. Add a case ID, choose a type, and upload a file.</p>
        ) : (
          <div className="record-list">
            {documents.map((doc) => (
              <article key={doc.id} className="record-item">
                <div>
                  <strong>{doc.name}</strong>
                  <p>{doc.type || 'General file'} for {doc.case_id || 'unassigned case'}</p>
                </div>
                <a className="inline-link" href={doc.url} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Documents;
