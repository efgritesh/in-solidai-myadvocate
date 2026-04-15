import { auth } from '../firebase';

const FUNCTIONS_BASE = 'https://asia-south1-in-solidai-myadvocate.cloudfunctions.net';

export const AI_TRIAL_CREDITS = 300;
export const AI_TRIAL_DAYS = 14;
export const AI_PLUS_PRICE_INR = 299;
export const AI_PLUS_INCLUDED_CREDITS = 1500;
export const AI_TOPUP_PACKS = [
  { id: 'starter_500', amountInr: 99, credits: 500 },
  { id: 'growth_1500', amountInr: 249, credits: 1500 },
  { id: 'pro_3500', amountInr: 499, credits: 3500 },
];

const authorizedPost = async (path, body = {}) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in to use AI billing.');
  }

  const response = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to complete the billing request.');
  }

  return data;
};

export const hasAiCredits = (summary = {}) =>
  (Number(summary.trialCreditsRemaining) || 0) +
    (Number(summary.includedCreditsRemaining) || 0) +
    (Number(summary.walletCreditsRemaining) || 0) > 0;

export const hasAiEntitlement = (summary = {}) =>
  Boolean(summary.hasEntitlement) || ['trial', 'ai_plus'].includes(summary.planTier);

export const canUseAiNow = (summary = {}) =>
  Boolean(summary.canUseAiNow) || (hasAiEntitlement(summary) && hasAiCredits(summary));

export const getAiCreditHeadline = (summary = {}) => {
  if ((Number(summary.trialCreditsRemaining) || 0) > 0) {
    return `${summary.trialCreditsRemaining} trial credits left`;
  }
  if ((Number(summary.includedCreditsRemaining) || 0) > 0) {
    return `${summary.includedCreditsRemaining} included credits left`;
  }
  if ((Number(summary.walletCreditsRemaining) || 0) > 0) {
    return `${summary.walletCreditsRemaining} wallet credits left`;
  }
  return 'No AI credits left';
};

export const getAiPlanLabel = (summary = {}) => {
  if (summary.planTier === 'ai_plus') return 'AI Plus';
  if (summary.planTier === 'trial') return 'AI Trial';
  return 'Core';
};

export const getAiAccessSummary = () => authorizedPost('getAiAccessSummaryHttp');
export const activateAiTrial = () => authorizedPost('activateAiTrialHttp');
export const subscribeAiPlus = () =>
  authorizedPost('subscribeAiPlusHttp', {
    plan: 'ai_plus_monthly',
    billingAmountInr: AI_PLUS_PRICE_INR,
    source: 'mock_subscription',
  });
export const cancelAiPlusRenewal = () => authorizedPost('cancelAiPlusRenewalHttp');
export const createWalletTopup = (packId) => authorizedPost('createWalletTopupHttp', { packId });
export const estimateAiUsage = (payload) => authorizedPost('estimateAiUsageHttp', payload);
