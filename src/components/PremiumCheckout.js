import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { activatePremiumSubscription, PREMIUM_PLAN_PRICE_INR } from '../utils/premium';
import { DraftingIcon } from './AppIcons';

const PremiumCheckout = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const params = new URLSearchParams(location.search);
  const nextPath = params.get('next') || '/drafting';

  const handleProceed = async () => {
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

  return (
    <PageShell title={t('dummyPaymentTitle')} subtitle={t('dummyPaymentSubtitle')} showBack>
      <section className="panel panel--accent">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('premiumPlanLabel')}</p>
            <h2>{t('dummyPaymentHeadline')}</h2>
          </div>
          <DraftingIcon className="app-icon section-icon" />
        </div>
        <p className="supporting-copy">{t('dummyPaymentBody', { amount: PREMIUM_PLAN_PRICE_INR })}</p>
      </section>

      <section className="panel">
        <div className="record-list">
          <article className="record-item"><div><strong>{t('premiumMonthlyPlan')}</strong><p>{t('dummyPaymentPlanLabel')}</p></div><span className="badge">{t('inrAmount', { amount: PREMIUM_PLAN_PRICE_INR })}</span></article>
          <article className="record-item"><div><strong>{t('paymentMode')}</strong><p>{t('dummyPaymentMode')}</p></div></article>
          <article className="record-item"><div><strong>{t('paymentPurpose')}</strong><p>{t('dummyPaymentPurpose')}</p></div></article>
        </div>
        {working ? <LoadingState compact label={t('dummyPaymentProcessing')} /> : null}
        {status ? <p className="error-text top-space">{status}</p> : null}
        <div className="button-row top-space">
          <button type="button" className="button" onClick={handleProceed} disabled={working}>
            {t('proceedToPayment')}
          </button>
          <Link className="button button--secondary" to={`/premium?next=${encodeURIComponent(nextPath)}`}>
            {t('back')}
          </Link>
        </div>
      </section>
    </PageShell>
  );
};

export default PremiumCheckout;
