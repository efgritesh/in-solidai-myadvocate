import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink } from '../utils/caseAccess';
import { EyeIcon, MessageIcon, WhatsAppIcon } from './AppIcons';

const Invite = () => {
  const { t } = useTranslation();
  const [caseLinks, setCaseLinks] = useState([]);

  useEffect(() => {
    const loadCases = async () => {
      const advocateId = auth.currentUser?.uid;
      if (!advocateId) return;
      const snapshot = await getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId)));
      setCaseLinks(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    };

    loadCases();
  }, []);

  const buildShareMessage = (caseItem) =>
    `iAdvocate has shared your case updates for ${caseItem.case_number}. Open your case link here: ${buildCaseAccessLink(
      caseItem.client_access_token
    )}`;

  return (
    <PageShell title={t('clientAccessLinks')} subtitle={t('clientAccessLinksSubtitle')} showBack>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('shareableCaseAccess')}</p>
            <h2>{caseLinks.length} {t('links')}</h2>
          </div>
        </div>
        {caseLinks.length === 0 ? (
          <p className="empty-state">{t('clientLinksEmpty')}</p>
        ) : (
          <div className="record-list">
            {caseLinks.map((caseItem) => (
              <article key={caseItem.id} className="record-item record-item--stack">
                <div>
                  <strong>{caseItem.case_number}</strong>
                  <p>{caseItem.client_name}</p>
                </div>
                <div className="inline-actions">
                  <a
                    className="icon-button"
                    href={`https://wa.me/?text=${encodeURIComponent(buildShareMessage(caseItem))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('shareOnWhatsApp')}
                    title={t('shareOnWhatsApp')}
                  >
                    <WhatsAppIcon className="app-icon" />
                  </a>
                  <a
                    className="icon-button"
                    href={`sms:?&body=${encodeURIComponent(buildShareMessage(caseItem))}`}
                    aria-label={t('shareBySms')}
                    title={t('shareBySms')}
                  >
                    <MessageIcon className="app-icon" />
                  </a>
                  <a
                    className="icon-button"
                    href={buildCaseAccessLink(caseItem.client_access_token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('previewClientCaseView')}
                    title={t('previewClientCaseView')}
                  >
                    <EyeIcon className="app-icon" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Invite;
