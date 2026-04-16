import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { auth, db, storage } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { syncCaseAccessDocument } from '../utils/clientAccessRecords';
import { useFirestoreCollection } from '../utils/firestoreCache';

const Documents = () => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [type, setType] = useState('');
  const advocateId = auth.currentUser?.uid;
  const documentsState = useFirestoreCollection({
    enabled: Boolean(advocateId),
    queryFactory: () => query(collection(db, 'documents'), where('advocate_id', '==', advocateId)),
    queryKey: [advocateId || '', 'documents'],
  });

  useEffect(() => {
    let active = true;
    const resolveDocuments = async () => {
      const resolvedDocuments = await Promise.all(
        documentsState.data.map(async (docItem) => {
          const record = { ...docItem };
          if (!record.url && record.storage_path) {
            try {
              record.url = await getDownloadURL(ref(storage, record.storage_path));
            } catch (error) {
              record.url = '';
            }
          }
          return record;
        })
      );
      if (active) {
        setDocuments(resolvedDocuments);
      }
    };

    resolveDocuments();
    return () => {
      active = false;
    };
  }, [documentsState.data]);

  const onDrop = async (acceptedFiles) => {
    if (!advocateId) return;
    if (!caseId || !type) {
      alert(t('documentsUploadGuard'));
      return;
    }
    const caseSnapshot = await getDocs(
      query(collection(db, 'cases'), where('advocate_id', '==', advocateId), where('case_number', '==', caseId))
    );
    const caseRecord = caseSnapshot.docs[0]?.data();

    for (const file of acceptedFiles) {
      const storageRef = ref(storage, `documents/${advocateId}/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const documentRef = await addDoc(collection(db, 'documents'), {
        advocate_id: advocateId,
        case_id: caseId,
        type,
        url,
        storage_path: storageRef.fullPath,
        name: file.name,
        mime_type: file.type || 'application/octet-stream',
        uploaded_by_role: 'advocate',
        client_access_token: caseRecord?.client_access_token || '',
      });

      if (caseRecord?.client_access_token) {
        await syncCaseAccessDocument(caseRecord.client_access_token, {
          advocate_id: advocateId,
          case_id: caseId,
          type,
          url,
          name: file.name,
          uploaded_by_role: 'advocate',
        }, documentRef.id);
      }
    }
  };

  const loading = documentsState.loadingInitial;
  const refreshing = documentsState.refreshing;

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <PageShell title={t('documents')} subtitle={t('documentsSubtitle')} showBack>
      {loading ? <LoadingState label={t('loadingWorkspace')} /> : (
      <>
      {refreshing ? <p className="helper-text">{t('refreshingWorkspace', { defaultValue: 'Refreshing from your latest saved data...' })}</p> : null}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('uploadPrep')}</p>
            <h2>{t('documentDetails')}</h2>
          </div>
        </div>
        <form>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('caseId')}:</label>
              <input type="text" placeholder={t('linkedCaseNumber')} value={caseId} onChange={(e) => setCaseId(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('type')}:</label>
              <input type="text" placeholder={t('documentTypePlaceholder')} value={type} onChange={(e) => setType(e.target.value)} />
            </div>
          </div>
        </form>
        <div className="dropzone" {...getRootProps()}>
          <input {...getInputProps()} />
          <p>{t('documentsDropzoneTitle')}</p>
          <small>{t('documentsDropzoneSubtitle')}</small>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('library')}</p>
            <h2>{documents.length} {t('files')}</h2>
          </div>
        </div>
        {documents.length === 0 ? (
          <p className="empty-state">{t('documentsEmpty')}</p>
        ) : (
          <div className="record-list">
            {documents.map((doc) => (
              <article key={doc.id} className="record-item">
                <div>
                  <strong>{doc.name}</strong>
                  <p>{doc.type || t('generalFile')} {t('forLabel')} {doc.case_id || t('unassignedCase')}</p>
                </div>
                <a className="inline-link" href={doc.url} target="_blank" rel="noopener noreferrer">
                  {t('open')}
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </PageShell>
  );
};

export default Documents;
