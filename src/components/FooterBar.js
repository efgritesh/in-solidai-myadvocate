import React from 'react';
import { useTranslation } from 'react-i18next';

const FooterBar = () => {
  const { t } = useTranslation();

  return (
    <footer className="app-footer">
      <p className="app-footer__copy">{t('copyrightLine')}</p>
    </footer>
  );
};

export default FooterBar;
