import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getStoredLanguage } from '../utils/language';

const INSTALL_DISMISSED_KEY = 'installPromptDismissed';

const isStandaloneMode = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIosBrowser = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
const isAndroidBrowser = () => /android/i.test(window.navigator.userAgent || '');

const AppEntry = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installReady, setInstallReady] = useState(isStandaloneMode());

  const shouldShowInstallFirst = useMemo(() => {
    if (isStandaloneMode()) return false;
    if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return false;
    return Boolean(installPrompt) || isIosBrowser() || isAndroidBrowser();
  }, [installPrompt]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallReady(true);
    };

    const handleInstalled = () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
      setInstallPrompt(null);
      setInstallReady(true);
      const hasLanguage = Boolean(getStoredLanguage());
      navigate(hasLanguage ? '/login' : '/language', { replace: true });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    const fallbackTimer = window.setTimeout(() => {
      setInstallReady(true);
    }, 600);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.clearTimeout(fallbackTimer);
    };
  }, [navigate]);

  useEffect(() => {
    if (!installReady && !shouldShowInstallFirst) {
      return;
    }

    if (!shouldShowInstallFirst) {
      const hasLanguage = Boolean(getStoredLanguage());
      navigate(hasLanguage ? '/login' : '/language', { replace: true });
    }
  }, [installReady, navigate, shouldShowInstallFirst]);

  const handleInstall = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
  };

  const handleContinue = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    const hasLanguage = Boolean(getStoredLanguage());
    navigate(hasLanguage ? '/login' : '/language', { replace: true });
  };

  return (
    <div className="auth-screen">
      <div className="auth-layout auth-layout--entry">
        <section className="auth-hero auth-hero--dark auth-hero--entry">
          <div className="auth-hero__body auth-hero__body--entry">
            <img
              className="auth-hero__logo auth-hero__logo--entry"
              src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
              alt="Supreme Court of India emblem"
            />
            <div className="auth-hero__copy">
              <p className="brand-mark brand-mark--light">{t('appName')}</p>
            </div>
          </div>
        </section>
        <div className="auth-card auth-card--entry">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('installAppEyebrow')}</p>
              <h2>{t('installAppTitle')}</h2>
            </div>
          </div>
          <p className="helper-text">{t('installAppSubtitle')}</p>
          {isIosBrowser() && !installPrompt ? (
            <div className="record-card top-space">
              <strong>{t('installAppIosTitle')}</strong>
              <p className="helper-text">{t('installAppIosBody')}</p>
            </div>
          ) : null}
          <div className="button-row top-space">
            {installPrompt ? (
              <button type="button" className="button" onClick={handleInstall}>
                {t('installAppButton')}
              </button>
            ) : null}
            <button type="button" className="button button--secondary" onClick={handleContinue}>
              {t('continueInBrowser')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppEntry;
