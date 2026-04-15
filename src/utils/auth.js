import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithRedirect,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { getStoredLanguage } from './language';
import { isAdvocateDraftReady } from './draftingProfiles';

export const roleRoutes = {
  admin: '/admin-dashboard',
  advocate: '/dashboard',
};

const GOOGLE_ROLE_KEY = 'pendingGoogleRole';
export const GOOGLE_FLOW_KEY = 'pendingGoogleFlow';
export const GOOGLE_FORCE_PROFILE_SETUP_KEY = 'forceProfileSetupAfterGoogleSignup';
const PERSISTED_GOOGLE_ROLE_KEY = 'persistedGoogleRole';
const PERSISTED_GOOGLE_FLOW_KEY = 'persistedGoogleFlow';
const PERSISTED_GOOGLE_FORCE_PROFILE_SETUP_KEY = 'persistedForceProfileSetupAfterGoogleSignup';
const defaultBillingState = {
  planTier: 'core',
  planStatus: 'inactive',
  trialStatus: 'unused',
  trialCreditsRemaining: 0,
  includedCreditsMonthly: 0,
  includedCreditsRemaining: 0,
  walletCreditsRemaining: 0,
  currentCycleStart: null,
  currentCycleEnd: null,
  autoRenew: false,
  subscriptionPlan: 'core',
  premiumStatus: 'inactive',
  premiumActive: false,
};

export const getRouteForRole = (role) => roleRoutes[role] || '/dashboard';

const getStoredGoogleRole = () =>
  sessionStorage.getItem(GOOGLE_ROLE_KEY) ||
  localStorage.getItem(PERSISTED_GOOGLE_ROLE_KEY) ||
  'advocate';

const getStoredGoogleFlow = () =>
  sessionStorage.getItem(GOOGLE_FLOW_KEY) ||
  localStorage.getItem(PERSISTED_GOOGLE_FLOW_KEY) ||
  'login';

export const shouldForceGoogleProfileSetup = () =>
  sessionStorage.getItem(GOOGLE_FORCE_PROFILE_SETUP_KEY) === '1' ||
  localStorage.getItem(PERSISTED_GOOGLE_FORCE_PROFILE_SETUP_KEY) === '1';

export const clearPendingGoogleState = () => {
  sessionStorage.removeItem(GOOGLE_ROLE_KEY);
  sessionStorage.removeItem(GOOGLE_FLOW_KEY);
  sessionStorage.removeItem(GOOGLE_FORCE_PROFILE_SETUP_KEY);
  localStorage.removeItem(PERSISTED_GOOGLE_ROLE_KEY);
  localStorage.removeItem(PERSISTED_GOOGLE_FLOW_KEY);
  localStorage.removeItem(PERSISTED_GOOGLE_FORCE_PROFILE_SETUP_KEY);
};

const normalizeAdvocateProfile = (profile = {}, user = null) => {
  const normalized = {
    ...profile,
    name: profile.name || user?.displayName || '',
    phone: profile.phone || '',
    officeAddress: profile.officeAddress || profile.address || '',
    address: profile.address || profile.officeAddress || '',
    enrollmentNumber: profile.enrollmentNumber || '',
    email: profile.email || user?.email || '',
  };

  if ((profile.role || 'advocate') === 'advocate') {
    normalized.profileComplete = isAdvocateDraftReady(normalized);
  }

  return normalized;
};

export const ensureUserProfile = async (user, role = 'advocate', extraData = {}) => {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const preferredLanguage = extraData.preferredLanguage || getStoredLanguage();
  const billingState = { ...defaultBillingState, ...extraData };

  if (!userSnap.exists()) {
    const baseProfile = normalizeAdvocateProfile({
      uid: user.uid,
      email: user.email || '',
      role,
      name: extraData.name || user.displayName || '',
      createdAt: new Date().toISOString(),
      profileComplete: role === 'admin',
      preferredLanguage,
      ...billingState,
      phone: extraData.phone || '',
      officeAddress: extraData.officeAddress || extraData.address || '',
      address: extraData.address || extraData.officeAddress || '',
      enrollmentNumber: extraData.enrollmentNumber || '',
    }, user);

    await setDoc(userRef, { ...baseProfile, ...extraData });
    return { ...baseProfile, ...extraData };
  }

  const currentData = userSnap.data();
  const mergedRole = currentData.role || role;

  const normalizedProfile = normalizeAdvocateProfile({
    ...currentData,
    role: mergedRole,
    preferredLanguage: currentData.preferredLanguage || preferredLanguage,
    planTier: currentData.planTier || billingState.planTier,
    planStatus: currentData.planStatus || billingState.planStatus,
    trialStatus: currentData.trialStatus || billingState.trialStatus,
    trialCreditsRemaining: typeof currentData.trialCreditsRemaining === 'number' ? currentData.trialCreditsRemaining : billingState.trialCreditsRemaining,
    includedCreditsMonthly: typeof currentData.includedCreditsMonthly === 'number' ? currentData.includedCreditsMonthly : billingState.includedCreditsMonthly,
    includedCreditsRemaining: typeof currentData.includedCreditsRemaining === 'number' ? currentData.includedCreditsRemaining : billingState.includedCreditsRemaining,
    walletCreditsRemaining: typeof currentData.walletCreditsRemaining === 'number' ? currentData.walletCreditsRemaining : billingState.walletCreditsRemaining,
    autoRenew: typeof currentData.autoRenew === 'boolean' ? currentData.autoRenew : billingState.autoRenew,
    subscriptionPlan: currentData.subscriptionPlan || billingState.subscriptionPlan,
    premiumStatus: currentData.premiumStatus || billingState.premiumStatus,
    premiumActive: typeof currentData.premiumActive === 'boolean' ? currentData.premiumActive : billingState.premiumActive,
  }, user);

  if (
    (!currentData.email && user.email) ||
    (!currentData.name && user.displayName) ||
    !currentData.preferredLanguage ||
    currentData.profileComplete !== normalizedProfile.profileComplete ||
    currentData.officeAddress !== normalizedProfile.officeAddress ||
    currentData.enrollmentNumber !== normalizedProfile.enrollmentNumber
  ) {
    await setDoc(
      userRef,
      {
        ...currentData,
        email: normalizedProfile.email,
        name: normalizedProfile.name,
        role: mergedRole,
        preferredLanguage: normalizedProfile.preferredLanguage,
        phone: normalizedProfile.phone,
        officeAddress: normalizedProfile.officeAddress,
        address: normalizedProfile.address,
        enrollmentNumber: normalizedProfile.enrollmentNumber,
        profileComplete: normalizedProfile.profileComplete,
      },
      { merge: false },
    );
  }

  return normalizedProfile;
};

export const loginWithEmail = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await ensureUserProfile(userCredential.user);
  return { user: userCredential.user, profile };
};

export const signupWithEmail = async ({ name, email, password, role }) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const profile = await ensureUserProfile(userCredential.user, role, {
    name,
    role,
    profileComplete: role === 'admin',
  });
  return { user: userCredential.user, profile };
};

export const loginWithGoogle = async (roleHint = 'advocate', flowType = 'login') => {
  console.log('[auth] loginWithGoogle:start', { roleHint, flowType });
  sessionStorage.setItem(GOOGLE_ROLE_KEY, roleHint);
  sessionStorage.setItem(GOOGLE_FLOW_KEY, flowType);
  localStorage.setItem(PERSISTED_GOOGLE_ROLE_KEY, roleHint);
  localStorage.setItem(PERSISTED_GOOGLE_FLOW_KEY, flowType);
  if (flowType === 'signup') {
    sessionStorage.setItem(GOOGLE_FORCE_PROFILE_SETUP_KEY, '1');
    localStorage.setItem(PERSISTED_GOOGLE_FORCE_PROFILE_SETUP_KEY, '1');
  }
  await signInWithRedirect(auth, googleProvider);
  return null;
};

export const consumeGoogleRedirect = async () => {
  console.log('[auth] consumeGoogleRedirect:start');
  const userCredential = await getRedirectResult(auth);
  if (!userCredential) {
    console.log('[auth] consumeGoogleRedirect:none');
    return null;
  }
  const roleHint = getStoredGoogleRole();
  const flowType = getStoredGoogleFlow();
  console.log('[auth] consumeGoogleRedirect:result', {
    uid: userCredential.user?.uid || null,
    email: userCredential.user?.email || null,
    roleHint,
    flowType,
  });
  const profile = await ensureUserProfile(userCredential.user, roleHint, {
    role: roleHint,
    profileComplete: roleHint === 'admin' ? true : false,
  });
  clearPendingGoogleState();
  console.log('[auth] consumeGoogleRedirect:profile', {
    uid: userCredential.user?.uid || null,
    role: profile?.role || null,
    profileComplete: profile?.profileComplete || false,
    preferredLanguage: profile?.preferredLanguage || null,
  });
  return { user: userCredential.user, profile, flowType };
};

export const resolveGoogleProfileFromStoredState = async (user) => {
  const hasStoredFlow =
    Boolean(sessionStorage.getItem(GOOGLE_FLOW_KEY)) ||
    Boolean(localStorage.getItem(PERSISTED_GOOGLE_FLOW_KEY));

  if (!user || !hasStoredFlow) {
    return null;
  }

  const roleHint = getStoredGoogleRole();
  const flowType = getStoredGoogleFlow();
  console.log('[auth] resolveGoogleProfileFromStoredState:start', {
    uid: user?.uid || null,
    email: user?.email || null,
    roleHint,
    flowType,
  });

  const profile = await ensureUserProfile(user, roleHint, {
    role: roleHint,
    profileComplete: roleHint === 'admin' ? true : false,
  });

  console.log('[auth] resolveGoogleProfileFromStoredState:profile', {
    uid: user?.uid || null,
    role: profile?.role || null,
    profileComplete: profile?.profileComplete || false,
  });

  return { profile, roleHint, flowType };
};
