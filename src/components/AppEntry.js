import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getStoredLanguage } from '../utils/language';
import { hasInstalledAppFlag, isStandaloneMode, markInstalledApp } from '../utils/pwa';

const isIosBrowser = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
const isAndroidBrowser = () => /android/i.test(window.navigator.userAgent || '');
const isChromeBrowser = () => /chrome|crios/i.test(window.navigator.userAgent || '');
const isSafariBrowser = () => /safari/i.test(window.navigator.userAgent || '') && !/chrome|crios|fxios|edgios/i.test(window.navigator.userAgent || '');
const isDesktopChromium = () => !isIosBrowser() && !isAndroidBrowser() && /chrome|edg/i.test(window.navigator.userAgent || '');

const AppEntry = ({ browserLocked = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installReady, setInstallReady] = useState(isStandaloneMode());
  const [copied, setCopied] = useState(false);
  const [installedFlag, setInstalledFlag] = useState(hasInstalledAppFlag());
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const installMode = useMemo(() => {
    if (isStandaloneMode()) return 'standalone';
    if (browserLocked || installedFlag) return 'open-installed-app';
    if (installPrompt) return 'prompt';
    if (isAndroidBrowser() && !isChromeBrowser()) return 'android-open-chrome';
    if (isAndroidBrowser()) return 'android-manual';
    if (isIosBrowser() && !isSafariBrowser()) return 'ios-open-safari';
    if (isIosBrowser()) return 'ios-safari';
    if (isDesktopChromium()) return 'desktop-manual';
    return 'desktop-open-chrome';
  }, [browserLocked, installPrompt, installedFlag]);

  useEffect(() => {
    if (isStandaloneMode()) {
      markInstalledApp();
      setInstalledFlag(true);
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallReady(true);
    };

    const handleInstalled = () => {
      markInstalledApp();
      setInstalledFlag(true);
      setInstallPrompt(null);
      setInstallReady(true);
      const hasLanguage = Boolean(getStoredLanguage());
      navigate(hasLanguage ? '/login' : '/language', { replace: true });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    const fallbackTimer = window.setTimeout(() => {
      setInstallReady(true);
    }, 1400);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.clearTimeout(fallbackTimer);
    };
  }, [navigate]);

  useEffect(() => {
    if (!installReady && installMode !== 'standalone') {
      return;
    }

    if (installMode === 'standalone') {
      markInstalledApp();
      setInstalledFlag(true);
      const hasLanguage = Boolean(getStoredLanguage());
      navigate(hasLanguage ? '/login' : '/language', { replace: true });
    }
  }, [installMode, installReady, navigate]);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyCurrentLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch (error) {
      setCopied(false);
    }
  };

  const handleInstall = async () => {
    if (installMode === 'open-installed-app') {
      window.location.reload();
      return;
    }

    if (installMode === 'prompt' && installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      return;
    }

    if (installMode === 'ios-safari' && canShare) {
      try {
        await navigator.share({
          title: t('appName'),
          text: t('installSharePrompt'),
          url: window.location.href,
        });
        return;
      } catch (error) {
        // User cancelled the share sheet or the browser rejected it.
      }
    }

    await copyCurrentLink();
  };

  const installGuide = useMemo(() => {
    switch (installMode) {
      case 'open-installed-app':
        return {
          title: t('openInstalledAppTitle'),
          body: t('openInstalledAppBody'),
          steps: [t('openInstalledAppStepOne'), t('openInstalledAppStepTwo')],
          buttonLabel: t('openInstalledAppButton'),
        };
      case 'prompt':
        return {
          title: t('installPromptReadyTitle'),
          body: t('installPromptReadyBody'),
          steps: [t('installPromptReadyStep')],
          buttonLabel: t('installPromptButton'),
        };
      case 'android-open-chrome':
        return {
          title: t('installAndroidChromeTitle'),
          body: t('installAndroidChromeBody'),
          steps: [t('installAndroidChromeStepOne'), t('installAndroidChromeStepTwo')],
          buttonLabel: copied ? t('installLinkCopied') : t('copyLinkButton'),
        };
      case 'android-manual':
        return {
          title: t('installAndroidManualTitle'),
          body: t('installAndroidManualBody'),
          steps: [t('installAndroidManualStepOne'), t('installAndroidManualStepTwo')],
          buttonLabel: copied ? t('installLinkCopied') : t('copyLinkButton'),
        };
      case 'ios-open-safari':
        return {
          title: t('installIosSafariTitle'),
          body: t('installIosSafariBody'),
          steps: [t('installIosSafariStepOne'), t('installIosSafariStepTwo')],
          buttonLabel: copied ? t('installLinkCopied') : t('copyLinkButton'),
        };
      case 'ios-safari':
        return {
          title: t('installIosShareTitle'),
          body: t('installIosShareBody'),
          steps: [t('installIosShareStepOne'), t('installIosShareStepTwo')],
          buttonLabel: canShare ? t('installIosShareButton') : copied ? t('installLinkCopied') : t('copyLinkButton'),
        };
      case 'desktop-manual':
        return {
          title: t('installDesktopTitle'),
          body: t('installDesktopBody'),
          steps: [t('installDesktopStepOne'), t('installDesktopStepTwo')],
          buttonLabel: copied ? t('installLinkCopied') : t('copyLinkButton'),
        };
      default:
        return {
          title: t('installDesktopBrowserTitle'),
          body: t('installDesktopBrowserBody'),
          steps: [t('installDesktopBrowserStepOne'), t('installDesktopBrowserStepTwo')],
          buttonLabel: copied ? t('installLinkCopied') : t('copyLinkButton'),
        };
    }
  }, [canShare, copied, installMode, t]);

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
          <p className="eyebrow">{t('installAppEyebrow')}</p>
          <h2>{browserLocked ? t('openInstalledAppTitle') : t('installAppTitle')}</h2>
          <p className="helper-text">{browserLocked ? t('openInstalledAppSubtitle') : t('installAppSubtitle')}</p>
          <div className="install-card top-space">
            <strong>{installGuide.title}</strong>
            <p className="helper-text">{installGuide.body}</p>
            <ol className="install-steps">
              {installGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="button-row top-space">
            <button type="button" className="button" onClick={handleInstall}>
              {installGuide.buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppEntry;
