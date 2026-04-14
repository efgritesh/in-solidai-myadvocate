import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteForRole, loginWithGoogle, signupWithEmail } from '../utils/auth';
import { saveCurrentUserLanguage, setStoredLanguage } from '../utils/language';
import LanguageSelector from './LanguageSelector';
import LoadingState from './LoadingState';

const SignUp = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'advocate',
  });
  const [error, setError] = useState('');
  const [googlePending, setGooglePending] = useState(false);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      const { profile } = await signupWithEmail(form);
      const nextLanguage = i18n.language || 'en';
      await i18n.changeLanguage(nextLanguage);
      setStoredLanguage(nextLanguage);
      await saveCurrentUserLanguage(nextLanguage);
      navigate(profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGooglePending(true);

    try {
      await loginWithGoogle(form.role, 'signup');
    } catch (err) {
      setError(err.message);
      setGooglePending(false);
    }
  };

  if (googlePending) {
    return <LoadingState fullScreen label="Continuing with Google..." />;
  }

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
              <p className="eyebrow">{t('roleBasedAccess')}</p>
              <h1>{t('createAccount')}</h1>
              <p className="auth-subtitle">{t('signupSubtitle')}</p>
            </div>
          </div>
        </section>
        <div className="auth-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t('role')}:</label>
              <select value={form.role} onChange={(e) => updateField('role', e.target.value)}>
                <option value="admin">Admin</option>
                <option value="advocate">Advocate</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('name')}:</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('email')}:</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('password')}:</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('confirmPassword')}:</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                required
              />
            </div>

            <button type="submit" className="button">{t('createAccountButton')}</button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button type="button" className="button secondary auth-secondary-button" onClick={handleGoogleSignup}>
            {t('continueWithGoogle')}
          </button>

          <p className="helper-text auth-footer">
            {t('alreadyHaveAccount')} <Link className="text-link" to="/login">{t('signIn')}</Link>
          </p>
          <p className="helper-text auth-footer">
            <Link className="text-link" to="/about#privacy">{t('privacyPolicy')}</Link> {' | '}
            <Link className="text-link" to="/about#consent">{t('consent')}</Link>
          </p>
          <p className="helper-text auth-footer">
            {t('supportEmailLabel')} <a className="text-link" href="mailto:ritesh.chaturvedi@solidai.in">ritesh.chaturvedi@solidai.in</a>
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};

export default SignUp;
