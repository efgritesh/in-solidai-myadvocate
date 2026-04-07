import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { getStoredLanguage } from './language';

export const roleRoutes = {
  admin: '/admin-dashboard',
  advocate: '/dashboard',
};

export const getRouteForRole = (role) => roleRoutes[role] || '/dashboard';

export const ensureUserProfile = async (user, role = 'advocate', extraData = {}) => {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const preferredLanguage = extraData.preferredLanguage || getStoredLanguage();

  if (!userSnap.exists()) {
    const baseProfile = {
      uid: user.uid,
      email: user.email || '',
      role,
      name: extraData.name || user.displayName || '',
      createdAt: new Date().toISOString(),
      profileComplete: role === 'admin',
      preferredLanguage,
    };

    await setDoc(userRef, { ...baseProfile, ...extraData });
    return { ...baseProfile, ...extraData };
  }

  const currentData = userSnap.data();
  const mergedRole = currentData.role || role;

  if ((!currentData.email && user.email) || (!currentData.name && user.displayName) || !currentData.preferredLanguage) {
    await updateDoc(userRef, {
      email: currentData.email || user.email || '',
      name: currentData.name || user.displayName || '',
      role: mergedRole,
      preferredLanguage: currentData.preferredLanguage || preferredLanguage,
    });
  }

  return { ...currentData, role: mergedRole, preferredLanguage: currentData.preferredLanguage || preferredLanguage };
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
