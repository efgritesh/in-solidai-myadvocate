import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteForRole, loginWithGoogle, signupWithEmail } from '../utils/auth';

const SignUp = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'advocate',
  });
  const [error, setError] = useState('');

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
      navigate(profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');

    try {
      const { profile } = await loginWithGoogle(form.role);
      navigate(profile.profileComplete ? getRouteForRole(profile.role) : '/profile-setup');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">Role-based access</p>
        <h1>Create your account</h1>
        <p className="auth-subtitle">
          Create an advocate or admin account. Clients will access their case using a secure link from the advocate.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Role:</label>
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
            <label>Confirm Password:</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              required
            />
          </div>

          <button type="submit" className="button">Create account</button>
        </form>

        <button type="button" className="button secondary auth-secondary-button" onClick={handleGoogleSignup}>
          Continue with Google
        </button>

        <p className="helper-text auth-footer">
          Already have an account? <Link className="text-link" to="/login">Sign in</Link>
        </p>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
};

export default SignUp;
