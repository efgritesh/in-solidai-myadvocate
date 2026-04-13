import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { ArrowRightIcon } from './AppIcons';
import { formatLifecycleDate, isHearingLifecycleStep } from '../utils/lifecycle';

const Hearings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCases = async () => {
      const advocateId = auth.currentUser?.uid;
      if (!advocateId) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId)));
        setCases(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
      } finally {
        setLoading(false);
      }
    };

    loadCases();
  }, []);

  const hearings = useMemo(
    () =>
      cases
        .flatMap((caseRecord) =>
          (caseRecord.lifecycle || [])
            .filter((step) => isHearingLifecycleStep(step))
            .map((step) => ({
              id: `${caseRecord.id}-${step.id}`,
              caseId: caseRecord.id,
              caseNumber: caseRecord.case_number,
              clientName: caseRecord.client_name,
              title: step.title,
              date: step.scheduled_date || '',
              eta: step.eta || '',
              status: step.status,
              notes: step.notes || '',
            }))
        )
        .sort((left, right) => {
          const leftDate = left.date || '9999-12-31';
          const rightDate = right.date || '9999-12-31';
          return new Date(leftDate) - new Date(rightDate);
        }),
    [cases]
  );

  return (
    <PageShell title={t('hearings')} subtitle={t('hearingsSubtitle')} showBack>
      {loading ? (
        <LoadingState label={t('loadingWorkspace')} />
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('calendar')}</p>
                <h2>{hearings.length} {t('hearingStages')}</h2>
              </div>
            </div>
            {hearings.length === 0 ? (
              <p className="empty-state">{t('hearingsEmpty')}</p>
            ) : (
              <div className="record-list">
                {hearings.map((hearing) => (
                  <article
                    key={hearing.id}
                    className="record-item record-item--interactive"
                    onClick={() => navigate(`/cases/${hearing.caseId}`)}
                  >
                    <div>
                      <strong>{hearing.title}</strong>
                      <p>{hearing.caseNumber} | {hearing.clientName}</p>
                      <p>{hearing.notes || t('noDescriptionAdded')}</p>
                    </div>
                    <div className="record-item__action">
                      <span className="badge">
                        {hearing.date ? formatLifecycleDate(hearing.date) : hearing.eta || t('dateToBeUpdated')}
                      </span>
                      <ArrowRightIcon className="app-icon" />
                    </div>
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

export default Hearings;
