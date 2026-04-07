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
      <div className="auth-layout">
        <section className="auth-hero">
          <img
            className="auth-hero__logo"
            src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
            alt="Supreme Court of India emblem"
          />
          <p className="eyebrow">{t('appName')}</p>
          <h1>{t('chooseLanguage')}</h1>
          <p className="auth-subtitle">{t('languageSubtitle')}</p>
        </section>
        <div className="auth-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('continueLabel')}</p>
              <h2>{t('selectLanguage')}</h2>
            </div>
          </div>
          <div className="auth-action-stack">
            <button className="button" onClick={() => handleLanguageSelect('en')}>
              {t('english')}
            </button>
            <button className="button secondary" onClick={() => handleLanguageSelect('hi')}>
              {t('hindi')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSelection;
