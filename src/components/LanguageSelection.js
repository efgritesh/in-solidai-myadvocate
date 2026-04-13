import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const LanguageSelection = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleLanguageSelect = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('selectedLanguage', lang);
    navigate('/login');
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
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
          {installPrompt ? (
            <section className="install-card top-space">
              <div>
                <strong>{t('installAppTitle')}</strong>
                <p className="helper-text">{t('installAppSubtitle')}</p>
              </div>
              <button type="button" className="button" onClick={handleInstall}>
                {t('installAppButton')}
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LanguageSelection;
