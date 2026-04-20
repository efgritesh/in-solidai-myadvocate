import React from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../config/appMeta';

const FooterBar = () => {
  const { t } = useTranslation();

  return (
    <footer className="app-footer">
      <p className="app-footer__copy">{t('copyrightLine', { version: APP_VERSION })}</p>
    </footer>
  );
};

export default FooterBar;
