import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { DraftingIcon, LockIcon } from './AppIcons';
import { PREMIUM_PLAN_PRICE_INR } from '../utils/premium';

const PremiumUpgrade = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const params = new URLSearchParams(location.search);
  const nextPath = params.get('next') || '/drafting';

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (active) {
        setProfile(userSnap.exists() ? userSnap.data() : null);
        setLoading(false);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <PageShell title={t('premiumTitle')} subtitle={t('premiumSubtitle')} showBack>
        <LoadingState label={t('loadingWorkspace')} />
      </PageShell>
    );
  }

  if (profile?.premiumActive) {
    return (
      <PageShell title={t('premiumTitle')} subtitle={t('premiumActiveSubtitle')} showBack>
        <section className="panel panel--accent">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('premiumPlanLabel')}</p>
              <h2>{t('premiumAlreadyActiveTitle')}</h2>
            </div>
            <DraftingIcon className="app-icon section-icon" />
          </div>
          <p className="supporting-copy">{t('premiumAlreadyActiveBody')}</p>
          <div className="button-row top-space">
            <button type="button" className="button" onClick={() => navigate(nextPath)}>
              {t('openDraftingAssistant')}
            </button>
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell title={t('premiumTitle')} subtitle={t('premiumSubtitle')} showBack>
      <section className="panel panel--accent">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('premiumPlanLabel')}</p>
            <h2>{t('premiumLockedFeatureTitle')}</h2>
          </div>
          <LockIcon className="app-icon section-icon" />
        </div>
        <p className="supporting-copy">{t('premiumLockedFeatureBody')}</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('premiumMonthlyPlan')}</p>
            <h2>{t('premiumPlanHeadline', { amount: PREMIUM_PLAN_PRICE_INR })}</h2>
          </div>
          <DraftingIcon className="app-icon section-icon" />
        </div>
        <div className="record-list">
          <article className="record-item"><div><strong>{t('aiDraftingAssistant')}</strong><p>{t('premiumFeatureDrafting')}</p></div></article>
          <article className="record-item"><div><strong>{t('reviewExtractedText')}</strong><p>{t('premiumFeatureOcr')}</p></div></article>
          <article className="record-item"><div><strong>{t('exportDocx')}</strong><p>{t('premiumFeatureExports')}</p></div></article>
        </div>
        <div className="button-row top-space">
          <Link className="button" to={`/premium/checkout?next=${encodeURIComponent(nextPath)}`}>
            {t('goToDummyPayment')}
          </Link>
          <Link className="button button--secondary" to="/dashboard">
            {t('backToDashboard')}
          </Link>
        </div>
      </section>
    </PageShell>
  );
};

export default PremiumUpgrade;
