import React from 'react';
import { useTranslation } from 'react-i18next';
import PageShell from './PageShell';
import { MessageIcon, WhatsAppIcon } from './AppIcons';

const APP_URL = 'https://iadvocate.solidai.in';

const Invite = () => {
  const { t } = useTranslation();

  const inviteMessage = `Join iAdvocate for a cleaner legal workspace. Install the app and create your account here: ${APP_URL}`;

  return (
    <PageShell title={t('inviteAdvocates')} subtitle={t('generateLink')} showBack>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('inviteAdvocates')}</p>
            <h2>iAdvocate</h2>
          </div>
        </div>
        <div className="workflow-helper-card">
          <strong>{APP_URL}</strong>
          <p>{t('generateLink')}</p>
          <div className="inline-actions">
            <a
              className="icon-button icon-button--whatsapp"
              href={`https://wa.me/?text=${encodeURIComponent(inviteMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('shareOnWhatsApp')}
              title={t('shareOnWhatsApp')}
            >
              <WhatsAppIcon className="app-icon" />
            </a>
            <a
              className="icon-button"
              href={`sms:?&body=${encodeURIComponent(inviteMessage)}`}
              aria-label={t('shareBySms')}
              title={t('shareBySms')}
            >
              <MessageIcon className="app-icon" />
            </a>
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default Invite;
