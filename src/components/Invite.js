import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../firebase';
import PageShell from './PageShell';

const Invite = () => {
  const { t } = useTranslation();
  const [inviteLink, setInviteLink] = useState('');

  const generateInviteLink = () => {
    const user = auth.currentUser;
    if (user) {
      const link = `${window.location.origin}/login?inviter=${user.uid}`;
      setInviteLink(link);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Link copied to clipboard.');
  };

  return (
    <PageShell
      title={t('inviteAdvocates')}
      subtitle="Share a reusable onboarding link with colleagues from a simple mobile screen."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Team setup</p>
            <h2>Invite another advocate</h2>
          </div>
        </div>
        <p className="helper-text">
          Generate a link tied to your current account and send it over WhatsApp, email, or SMS.
        </p>
        <button className="button" onClick={generateInviteLink}>
          {t('generateLink')}
        </button>
        {inviteLink ? (
          <div className="form-group form-group--tight">
            <label>Invite Link:</label>
            <input type="text" value={inviteLink} readOnly />
            <button className="button" onClick={copyToClipboard}>Copy</button>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
};

export default Invite;
