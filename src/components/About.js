import React from 'react';
import { useTranslation } from 'react-i18next';
import PageShell from './PageShell';

const About = () => {
  const { t } = useTranslation();
  const featureRows = [
    ['aboutFeatureDashboardsTitle', 'aboutFeatureDashboardsBody'],
    ['aboutFeatureClientsTitle', 'aboutFeatureClientsBody'],
    ['aboutFeatureCasesTitle', 'aboutFeatureCasesBody'],
    ['aboutFeatureClientAccessTitle', 'aboutFeatureClientAccessBody'],
    ['aboutFeatureDraftingTitle', 'aboutFeatureDraftingBody'],
    ['aboutFeatureBillingTitle', 'aboutFeatureBillingBody'],
    ['aboutFeatureDocumentsTitle', 'aboutFeatureDocumentsBody'],
    ['aboutFeaturePaymentsTitle', 'aboutFeaturePaymentsBody'],
    ['aboutFeatureSecurityTitle', 'aboutFeatureSecurityBody'],
  ];
  const gettingStartedRows = [
    ['aboutStepOneTitle', 'aboutStepOneBody'],
    ['aboutStepTwoTitle', 'aboutStepTwoBody'],
    ['aboutStepThreeTitle', 'aboutStepThreeBody'],
    ['aboutStepFourTitle', 'aboutStepFourBody'],
  ];

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
          {featureRows.map(([titleKey, bodyKey]) => (
            <article key={titleKey} className="record-item">
              <div>
                <strong>{t(titleKey)}</strong>
                <p>{t(bodyKey)}</p>
              </div>
            </article>
          ))}
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
          {gettingStartedRows.map(([titleKey, bodyKey]) => (
            <article key={titleKey} className="record-item">
              <div>
                <strong>{t(titleKey)}</strong>
                <p>{t(bodyKey)}</p>
              </div>
            </article>
          ))}
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
