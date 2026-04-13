import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { DraftingIcon } from './AppIcons';
import { activatePremiumSubscription, PREMIUM_PLAN_PRICE_INR } from '../utils/premium';
import useCurrentUserProfile from '../utils/useCurrentUserProfile';

const PremiumUpgrade = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, loading } = useCurrentUserProfile();
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const params = new URLSearchParams(location.search);
  const nextPath = params.get('next') || '/drafting';

  const handleSubscribe = async () => {
    setWorking(true);
    setStatus('');

    try {
      await activatePremiumSubscription();
      navigate(nextPath, {
        replace: true,
        state: { premiumActivated: true },
      });
    } catch (error) {
      setStatus(error.message);
      setWorking(false);
    }
  };

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
      <section className="panel panel--accent premium-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('premiumPlanLabel')}</p>
            <h2>{t('premiumPlanHeadline', { amount: PREMIUM_PLAN_PRICE_INR })}</h2>
          </div>
          <DraftingIcon className="app-icon section-icon" />
        </div>
        <p className="supporting-copy">{t('premiumLockedFeatureBody')}</p>
        <div className="record-list">
          <article className="record-item"><div><strong>{t('aiDraftingAssistant')}</strong><p>{t('premiumFeatureDrafting')}</p></div></article>
          <article className="record-item"><div><strong>{t('reviewExtractedText')}</strong><p>{t('premiumFeatureOcr')}</p></div></article>
          <article className="record-item"><div><strong>{t('exportDocx')}</strong><p>{t('premiumFeatureExports')}</p></div></article>
        </div>
        {working ? <LoadingState compact label={t('premiumActivating')} /> : null}
        {status ? <p className="error-text top-space">{status}</p> : null}
        <div className="button-row top-space">
          <button type="button" className="button" onClick={handleSubscribe} disabled={working}>
            {t('subscribe')}
          </button>
          <button type="button" className="button button--secondary" onClick={() => navigate('/dashboard')}>
            {t('backToDashboard')}
          </button>
        </div>
      </section>
    </PageShell>
  );
};

export default PremiumUpgrade;
