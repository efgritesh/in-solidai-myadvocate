import React from 'react';
import { useTranslation } from 'react-i18next';
import { GlobeIcon } from './AppIcons';
import {
  languageOptions,
  setStoredClientLanguage,
  setStoredLanguage,
  saveCurrentUserLanguage,
} from '../utils/language';

const LanguageSelector = ({ token = '', mode = 'user', className = '', variant = 'inline' }) => {
  const { i18n, t } = useTranslation();
  const currentLanguage = languageOptions.find((option) => option.value === (i18n.language || 'en')) || languageOptions[0];

  const handleChange = async (event) => {
    const nextLanguage = event.target.value;
    await i18n.changeLanguage(nextLanguage);

    if (mode === 'client') {
      setStoredClientLanguage(token, nextLanguage);
      return;
    }

    setStoredLanguage(nextLanguage);
    await saveCurrentUserLanguage(nextLanguage);
  };

  return (
    <label className={`language-selector language-selector--${variant} ${className}`.trim()}>
      <span className="sr-only">{t('selectLanguage')}</span>
      {variant === 'icon' ? <GlobeIcon className="app-icon language-selector__icon" /> : null}
      <select value={i18n.language || 'en'} onChange={handleChange} aria-label={currentLanguage.label}>
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSelector;
