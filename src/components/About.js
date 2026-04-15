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
            <h2>{t('aboutOnboardingTitle')}</h2>
          </div>
        </div>
        <p className="empty-state">{t('aboutOnboardingBody')}</p>
        <div className="record-list">
          <article className="record-item"><div><strong>{t('aboutFeatureDashboardsTitle')}</strong><p>{t('aboutFeatureDashboardsBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeatureClientsTitle')}</strong><p>{t('aboutFeatureClientsBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeatureCasesTitle')}</strong><p>{t('aboutFeatureCasesBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeatureClientAccessTitle')}</strong><p>{t('aboutFeatureClientAccessBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeatureDraftingTitle')}</strong><p>{t('aboutFeatureDraftingBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeatureDocumentsTitle')}</strong><p>{t('aboutFeatureDocumentsBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeaturePaymentsTitle')}</strong><p>{t('aboutFeaturePaymentsBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutFeatureSecurityTitle')}</strong><p>{t('aboutFeatureSecurityBody')}</p></div></article>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('aboutGettingStartedEyebrow')}</p>
            <h2>{t('aboutGettingStartedTitle')}</h2>
          </div>
        </div>
        <div className="record-list">
          <article className="record-item"><div><strong>{t('aboutStepOneTitle')}</strong><p>{t('aboutStepOneBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutStepTwoTitle')}</strong><p>{t('aboutStepTwoBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutStepThreeTitle')}</strong><p>{t('aboutStepThreeBody')}</p></div></article>
          <article className="record-item"><div><strong>{t('aboutStepFourTitle')}</strong><p>{t('aboutStepFourBody')}</p></div></article>
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
