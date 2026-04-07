import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const FooterBar = () => {
  const { t } = useTranslation();

  return (
    <footer className="app-footer">
      <div className="app-footer__links">
        <Link to="/about">{t('about')}</Link>
        <Link to="/invite">{t('clientLinks')}</Link>
        <a href="mailto:ritesh.chaturvedi@solidai.in">ritesh.chaturvedi@solidai.in</a>
      </div>
      <p className="app-footer__copy">{t('copyrightLine')}</p>
    </footer>
  );
};

export default FooterBar;
