import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  languageOptions,
  setStoredClientLanguage,
  setStoredLanguage,
  saveCurrentUserLanguage,
} from '../utils/language';

const LanguageSelector = ({ token = '', mode = 'user', className = '' }) => {
  const { i18n } = useTranslation();

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
    <label className={`language-selector ${className}`.trim()}>
      <span className="sr-only">Language</span>
      <select value={i18n.language || 'en'} onChange={handleChange} aria-label="Language">
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
