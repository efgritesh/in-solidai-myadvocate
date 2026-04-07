import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const APP_LANGUAGE_KEY = 'selectedLanguage';
export const DEFAULT_LANGUAGE = 'en';

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिंदी' },
];

export const getStoredLanguage = () => localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE;

export const setStoredLanguage = (language) => {
  localStorage.setItem(APP_LANGUAGE_KEY, language);
};

export const getClientLanguageKey = (token) => `client-language:${token}`;

export const getStoredClientLanguage = (token) => {
  if (!token) return '';
  return localStorage.getItem(getClientLanguageKey(token)) || '';
};

export const setStoredClientLanguage = (token, language) => {
  if (!token) return;
  localStorage.setItem(getClientLanguageKey(token), language);
};

export const saveCurrentUserLanguage = async (language) => {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  await updateDoc(doc(db, 'users', userId), { preferredLanguage: language });
};

