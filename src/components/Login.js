import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteForRole, loginWithEmail, loginWithGoogle } from '../utils/auth';
import { saveCurrentUserLanguage, setStoredLanguage } from '../utils/language';
import LanguageSelector from './LanguageSelector';

const Login = () => {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const completeLogin = async (profile) => {
    const nextLanguage = i18n.language || 'en';
    await i18n.changeLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
    if (profile.preferredLanguage !== nextLanguage) {
      await saveCurrentUserLanguage(nextLanguage);
    }
    navigate(profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const { profile } = await loginWithEmail(email, password);
      await completeLogin(profile);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');

    try {
      const { profile } = await loginWithGoogle('advocate');
      await completeLogin(profile);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <section className="auth-hero auth-hero--dark">
          <div className="auth-hero__topbar">
            <LanguageSelector className="auth-language-selector" variant="icon" />
          </div>
          <div className="auth-hero__body">
            <img
              className="auth-hero__logo"
              src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
              alt="Supreme Court of India emblem"
            />
            <div className="auth-hero__copy">
              <p className="eyebrow">{t('secureAccess')}</p>
              <h1>{t('login')}</h1>
              <p className="auth-subtitle">{t('loginSubtitle')}</p>
            </div>
          </div>
        </section>
        <div className="auth-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t('email')}:</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('password')}:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="button">{t('submit')}</button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button type="button" className="button secondary auth-secondary-button" onClick={handleGoogleLogin}>
            {t('continueWithGoogle')}
          </button>

          <p className="helper-text auth-footer">
            {t('needAccount')} <Link className="text-link" to="/signup">{t('createOne')}</Link>
          </p>
          <p className="helper-text auth-footer">
            <Link className="text-link" to="/about#privacy">{t('privacyPolicy')}</Link> {' | '}
            <Link className="text-link" to="/about#consent">{t('consent')}</Link>
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};

export default Login;
