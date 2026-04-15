import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageShell from './PageShell';
import LoadingState from './LoadingState';
import { DraftingIcon } from './AppIcons';
import {
  activateAiTrial,
  AI_PLUS_INCLUDED_CREDITS,
  AI_PLUS_PRICE_INR,
  AI_TOPUP_PACKS,
  cancelAiPlusRenewal,
  canUseAiNow,
  createWalletTopup,
  getAiCreditHeadline,
  getAiPlanLabel,
  hasAiEntitlement,
  subscribeAiPlus,
} from '../utils/billing';
import useAiAccessSummary from '../utils/useAiAccessSummary';

const PremiumUpgrade = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { summary, loading, error, refresh } = useAiAccessSummary();
  const [workingAction, setWorkingAction] = useState('');
  const [status, setStatus] = useState('');

  const params = new URLSearchParams(location.search);
  const nextPath = params.get('next') || '/drafting';
  const feature = params.get('feature') || 'drafting';
  const featureLabel = t(feature) === feature ? feature.replace(/_/g, ' ') : t(feature);

  const usageRows = useMemo(() => summary?.recentUsage || [], [summary]);

  const runAction = async (key, action) => {
    setWorkingAction(key);
    setStatus('');
    try {
      await action();
      await refresh();
      if (key === 'trial' || key === 'subscribe') {
        navigate(nextPath, { replace: true });
      } else {
        setStatus(t('aiAccessUpdated'));
      }
    } catch (actionError) {
      setStatus(actionError.message);
    } finally {
      setWorkingAction('');
    }
  };

  if (loading) {
    return (
      <PageShell title={t('aiAccessTitle')} subtitle={t('aiAccessSubtitle')} showBack>
        <LoadingState label={t('loadingWorkspace')} />
      </PageShell>
    );
  }

  const headline = summary ? getAiCreditHeadline(summary) : t('noAiCreditsLeft');
  const planLabel = summary ? getAiPlanLabel(summary) : t('corePlan');
  const activeNow = canUseAiNow(summary || {});
  const entitled = hasAiEntitlement(summary || {});

  return (
    <PageShell title={t('aiAccessTitle')} subtitle={t('aiAccessSubtitle')} showBack>
      <section className="panel panel--accent premium-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('aiAccessEyebrow')}</p>
            <h2>{t('aiAccessForFeature', { feature: featureLabel })}</h2>
          </div>
          <DraftingIcon className="app-icon section-icon" />
        </div>
        <p className="supporting-copy">
          {activeNow ? t('aiAccessReadyBody') : entitled ? t('aiAccessTopupBody') : t('aiAccessLockedBody')}
        </p>
        {error ? <p className="inline-feedback inline-feedback--error">{error}</p> : null}
        {status ? <p className="inline-feedback">{status}</p> : null}
        <div className="record-list">
          <article className="record-item">
            <div>
              <strong>{planLabel}</strong>
              <p>{headline}</p>
            </div>
          </article>
          <article className="record-item">
            <div>
              <strong>{t('thisMonthUsage')}</strong>
              <p>{t('aiUsageBreakdown', {
                input: summary?.monthUsage?.inputTokens || 0,
                output: summary?.monthUsage?.outputTokens || 0,
                ocr: summary?.monthUsage?.ocrUnits || 0,
                credits: summary?.monthUsage?.creditsConsumed || 0,
              })}</p>
            </div>
          </article>
          <article className="record-item">
            <div>
              <strong>{t('creditBalances')}</strong>
              <p>{t('creditBalanceBreakdown', {
                trial: summary?.trialCreditsRemaining || 0,
                included: summary?.includedCreditsRemaining || 0,
                wallet: summary?.walletCreditsRemaining || 0,
              })}</p>
            </div>
          </article>
        </div>
        <div className="button-row top-space">
          {!entitled && summary?.trialStatus === 'unused' ? (
            <button
              type="button"
              className="button"
              onClick={() => runAction('trial', activateAiTrial)}
              disabled={Boolean(workingAction)}
            >
              {workingAction === 'trial' ? t('processing') : t('startFreeTrial')}
            </button>
          ) : null}
          {summary?.planTier !== 'ai_plus' ? (
            <button
              type="button"
              className="button"
              onClick={() => runAction('subscribe', subscribeAiPlus)}
              disabled={Boolean(workingAction)}
            >
              {workingAction === 'subscribe' ? t('processing') : t('subscribeAiPlus', { amount: AI_PLUS_PRICE_INR, credits: AI_PLUS_INCLUDED_CREDITS })}
            </button>
          ) : null}
          {summary?.planTier === 'ai_plus' && summary?.autoRenew ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => runAction('cancel', cancelAiPlusRenewal)}
              disabled={Boolean(workingAction)}
            >
              {workingAction === 'cancel' ? t('processing') : t('turnOffRenewal')}
            </button>
          ) : null}
          {activeNow ? (
            <button type="button" className="button button--secondary" onClick={() => navigate(nextPath)}>
              {t('continueToAiFeature')}
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('walletCreditsTitle')}</p>
            <h2>{t('topUpWallet')}</h2>
          </div>
        </div>
        <div className="record-list">
          {AI_TOPUP_PACKS.map((pack) => (
            <article key={pack.id} className="record-item">
              <div>
                <strong>{t('topUpPackLabel', { amount: pack.amountInr })}</strong>
                <p>{t('topUpPackCredits', { credits: pack.credits })}</p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => runAction(pack.id, () => createWalletTopup(pack.id))}
                disabled={Boolean(workingAction)}
              >
                {workingAction === pack.id ? t('processing') : t('buyCredits')}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('recentAiUsage')}</p>
            <h2>{t('usageHistory')}</h2>
          </div>
        </div>
        {usageRows.length === 0 ? (
          <p className="empty-state">{t('usageHistoryEmpty')}</p>
        ) : (
          <div className="record-list">
            {usageRows.map((item) => (
              <article key={item.id} className="record-item">
                <div>
                  <strong>{t(item.feature) || item.feature}</strong>
                  <p>{item.caseId || item.clientId || t('generalUsage')}</p>
                  <p>{item.createdAt}</p>
                </div>
                <span className="badge">{t('creditsUsedBadge', { credits: item.creditsConsumed || 0 })}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default PremiumUpgrade;
