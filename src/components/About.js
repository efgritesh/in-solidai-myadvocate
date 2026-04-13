import React from 'react';
import { useTranslation } from 'react-i18next';
import PageShell from './PageShell';

const About = () => {
  const { t } = useTranslation();

  return (
    <PageShell title={t('about')} subtitle={t('aboutSubtitle')} showBack>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('about')}</p>
            <h2>{t('aboutWhatItIs')}</h2>
          </div>
        </div>
        <p className="empty-state">{t('aboutDescription')}</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('forAdvocates')}</p>
            <h2>{t('aboutAdvocateSuiteTitle')}</h2>
          </div>
        </div>
        <div className="record-list">
          <article className="record-item"><div><strong>{t('practiceDashboard')}</strong><p>{t('aboutAdvocateDashboard')}</p></div></article>
          <article className="record-item"><div><strong>{t('cases')}</strong><p>{t('aboutAdvocateCases')}</p></div></article>
          <article className="record-item"><div><strong>{t('aiDraftingAssistant')}</strong><p>{t('aboutAdvocateDrafting')}</p></div></article>
          <article className="record-item"><div><strong>{t('clientLinks')}</strong><p>{t('aboutAdvocateClientLinks')}</p></div></article>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('features')}</p>
            <h2>{t('aboutRecentCapabilitiesTitle')}</h2>
          </div>
        </div>
        <div className="record-list">
          <article className="record-item"><div><strong>{t('cases')}</strong><p>{t('aboutCases')}</p></div></article>
          <article className="record-item"><div><strong>{t('clientLinks')}</strong><p>{t('aboutClientLinks')}</p></div></article>
          <article className="record-item"><div><strong>{t('payments')}</strong><p>{t('aboutPayments')}</p></div></article>
          <article className="record-item"><div><strong>{t('documents')}</strong><p>{t('aboutDocuments')}</p></div></article>
          <article className="record-item"><div><strong>{t('hearings')}</strong><p>{t('aboutHearings')}</p></div></article>
          <article className="record-item"><div><strong>{t('languageSupport')}</strong><p>{t('aboutLanguageSupport')}</p></div></article>
        </div>
      </section>

      <section id="privacy" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('privacyPolicy')}</p>
            <h2>{t('privacyTitle')}</h2>
          </div>
        </div>
        <p className="empty-state">{t('privacyBody')}</p>
      </section>

      <section id="consent" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('consent')}</p>
            <h2>{t('consentTitle')}</h2>
          </div>
        </div>
        <p className="empty-state">{t('consentBody')}</p>
        <p className="helper-text top-space">{t('supportEmailLabel')} <a className="text-link" href="mailto:ritesh.chaturvedi@solidai.in">ritesh.chaturvedi@solidai.in</a></p>
      </section>
    </PageShell>
  );
};

export default About;
