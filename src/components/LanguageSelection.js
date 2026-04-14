import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getStoredLanguage } from '../utils/language';

const LanguageSelection = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const existingLanguage = getStoredLanguage();
    if (existingLanguage) {
      navigate('/login', { replace: true });
      return;
    }
  }, [navigate]);

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
          <p className="brand-mark">{t('appName')}</p>
          <h1>{t('chooseLanguage')}</h1>
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
