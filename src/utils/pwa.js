const INSTALL_FLAG_KEY = 'iadvocate-installed';

const isMobileDevice = () => /android|iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
const isCompactViewport = () => window.matchMedia?.('(max-width: 960px)').matches;

export const isStandaloneMode = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const markInstalledApp = () => {
  try {
    window.localStorage.setItem(INSTALL_FLAG_KEY, '1');
  } catch (error) {
    // Ignore storage issues and continue.
  }
};

export const hasInstalledAppFlag = () => {
  try {
    return window.localStorage.getItem(INSTALL_FLAG_KEY) === '1';
  } catch (error) {
    return false;
  }
};

export const shouldForceOpenInstalledApp = () =>
  hasInstalledAppFlag() &&
  !isStandaloneMode() &&
  (isMobileDevice() || isCompactViewport());
