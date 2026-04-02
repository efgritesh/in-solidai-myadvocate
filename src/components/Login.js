import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase';

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          role: 'advocate',
          createdAt: new Date().toISOString(),
          profileComplete: false,
        });
        navigate('/profile-setup');
      } else {
        const userData = userSnap.data();
        navigate(userData.profileComplete ? '/dashboard' : '/profile-setup');
      }
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
          Sign in to review your matters, hearings, and payment updates.
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
          {error ? <p style={{ color: 'red' }}>{error}</p> : null}
        </form>
      </div>
    </div>
  );
};

export default Login;
