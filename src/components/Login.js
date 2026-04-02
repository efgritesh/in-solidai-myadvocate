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
      <div className="auth-card">
        <p className="eyebrow">Secure access</p>
        <h1>{t('login')}</h1>
        <p className="auth-subtitle">
          Sign in with email or Google and we will route you to the correct dashboard.
        </p>

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

        <button type="button" className="button secondary auth-secondary-button" onClick={handleGoogleLogin}>
          Continue with Google
        </button>

        <p className="helper-text auth-footer">
          Need a test account? <Link className="text-link" to="/signup">Create one</Link>
        </p>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
};

export default Login;
