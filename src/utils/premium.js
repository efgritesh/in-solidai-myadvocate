import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export const PREMIUM_PLAN_PRICE_INR = 200;

const activatePremiumCallable = httpsCallable(functions, 'activatePremiumSubscription');

export const activatePremiumSubscription = async () => {
  const response = await activatePremiumCallable({
    plan: 'premium_monthly',
    billingAmountInr: PREMIUM_PLAN_PRICE_INR,
    source: 'dummy_checkout',
  });

  return response.data;
};
