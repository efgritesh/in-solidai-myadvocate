import React from 'react';
import { useTranslation } from 'react-i18next';

const APP_VERSION = 'v1.9';

const FooterBar = () => {
  const { t } = useTranslation();

  return (
    <footer className="app-footer">
      <p className="app-footer__copy">{t('copyrightLine', { version: APP_VERSION })}</p>
    </footer>
  );
};

export default FooterBar;
