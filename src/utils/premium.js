import { auth } from '../firebase';

export const PREMIUM_PLAN_PRICE_INR = 200;

export const activatePremiumSubscription = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in to activate premium.');
  }

  const response = await fetch(
    'https://asia-south1-in-solidai-myadvocate.cloudfunctions.net/activatePremiumSubscriptionHttp',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        plan: 'premium_monthly',
        billingAmountInr: PREMIUM_PLAN_PRICE_INR,
        source: 'dummy_checkout',
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to activate premium.');
  }

  return data;
};
