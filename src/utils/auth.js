import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { getStoredLanguage } from './language';
import { isAdvocateDraftReady } from './draftingProfiles';

export const roleRoutes = {
  admin: '/admin-dashboard',
  advocate: '/dashboard',
};

export const getRouteForRole = (role) => roleRoutes[role] || '/dashboard';

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
  const subscriptionPlan = extraData.subscriptionPlan || 'starter';
  const premiumStatus = extraData.premiumStatus || 'inactive';
  const premiumActive = extraData.premiumActive || false;

  if (!userSnap.exists()) {
    const baseProfile = normalizeAdvocateProfile({
      uid: user.uid,
      email: user.email || '',
      role,
      name: extraData.name || user.displayName || '',
      createdAt: new Date().toISOString(),
      profileComplete: role === 'admin',
      preferredLanguage,
      subscriptionPlan,
      premiumStatus,
      premiumActive,
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
    subscriptionPlan: currentData.subscriptionPlan || subscriptionPlan,
    premiumStatus: currentData.premiumStatus || premiumStatus,
    premiumActive: typeof currentData.premiumActive === 'boolean' ? currentData.premiumActive : premiumActive,
  }, user);

  if (
    (!currentData.email && user.email) ||
    (!currentData.name && user.displayName) ||
    !currentData.preferredLanguage ||
    currentData.profileComplete !== normalizedProfile.profileComplete ||
    currentData.officeAddress !== normalizedProfile.officeAddress ||
    currentData.enrollmentNumber !== normalizedProfile.enrollmentNumber
  ) {
    await updateDoc(userRef, {
      email: normalizedProfile.email,
      name: normalizedProfile.name,
      role: mergedRole,
      preferredLanguage: normalizedProfile.preferredLanguage,
      phone: normalizedProfile.phone,
      officeAddress: normalizedProfile.officeAddress,
      address: normalizedProfile.address,
      enrollmentNumber: normalizedProfile.enrollmentNumber,
      profileComplete: normalizedProfile.profileComplete,
    });
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

export const loginWithGoogle = async (roleHint = 'advocate') => {
  const userCredential = await signInWithPopup(auth, googleProvider);
  const profile = await ensureUserProfile(userCredential.user, roleHint, {
    role: roleHint,
    profileComplete: roleHint === 'admin' ? true : false,
  });
  return { user: userCredential.user, profile };
};
