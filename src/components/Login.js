import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteForRole, loginWithEmail, loginWithGoogle } from '../utils/auth';

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const completeLogin = (profile) => {
    navigate(profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const { profile } = await loginWithEmail(email, password);
      completeLogin(profile);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');

    try {
      const { profile } = await loginWithGoogle('advocate');
      completeLogin(profile);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <section className="auth-hero auth-hero--dark">
          <img
            className="auth-hero__logo"
            src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Emblem_of_the_Supreme_Court_of_India.svg"
            alt="Supreme Court of India emblem"
          />
          <p className="eyebrow">{t('secureAccess')}</p>
          <h1>{t('login')}</h1>
          <p className="auth-subtitle">{t('loginSubtitle')}</p>
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
            {t('needTestAccount')} <Link className="text-link" to="/signup">{t('createOne')}</Link>
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};

export default Login;
