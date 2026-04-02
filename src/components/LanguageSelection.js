import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const LanguageSelection = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const handleLanguageSelect = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('selectedLanguage', lang);
    navigate('/login');
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">My Advocate</p>
        <h1>{t('chooseLanguage')}</h1>
        <p className="auth-subtitle">
          A mobile-first workspace for hearings, clients, and case updates.
        </p>
        <button className="button" onClick={() => handleLanguageSelect('en')}>
          {t('english')}
        </button>
        <button className="button" onClick={() => handleLanguageSelect('hi')}>
          {t('hindi')}
        </button>
      </div>
    </div>
  );
};

export default LanguageSelection;
