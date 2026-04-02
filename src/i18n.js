import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      login: 'Login',
      email: 'Email',
      password: 'Password',
      submit: 'Submit',
      dashboard: 'Dashboard',
      cases: 'Cases',
      clients: 'Clients',
      hearings: 'Hearings',
      payments: 'Payments',
      documents: 'Documents',
      chooseLanguage: 'Choose Language',
      english: 'English',
      hindi: 'Hindi',
      next: 'Next',
      profileSetup: 'Profile Setup',
      name: 'Name',
      phone: 'Phone',
      address: 'Address',
      profilePic: 'Profile Picture',
      save: 'Save',
      inviteAdvocates: 'Invite Advocates',
      generateLink: 'Generate Invite Link',
      home: 'Home',
    },
  },
  hi: {
    translation: {
      login: 'Login',
      email: 'Email',
      password: 'Password',
      submit: 'Submit',
      dashboard: 'Dashboard',
      cases: 'Cases',
      clients: 'Clients',
      hearings: 'Hearings',
      payments: 'Payments',
      documents: 'Documents',
      chooseLanguage: 'Choose Language',
      english: 'English',
      hindi: 'Hindi',
      next: 'Next',
      profileSetup: 'Profile Setup',
      name: 'Name',
      phone: 'Phone',
      address: 'Address',
      profilePic: 'Profile Picture',
      save: 'Save',
      inviteAdvocates: 'Invite Advocates',
      generateLink: 'Generate Invite Link',
      home: 'Home',
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
