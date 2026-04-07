import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { auth, db, storage } from '../firebase';
import { getRouteForRole } from '../utils/auth';

const ProfileSetup = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    setProfilePic(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const user = auth.currentUser;
      let profilePicUrl = '';

      if (profilePic) {
        const storageRef = ref(storage, `profilePics/${user.uid}`);
        await uploadBytes(storageRef, profilePic);
        profilePicUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        name,
        phone,
        address,
        profilePicUrl,
        profileComplete: true,
        preferredLanguage: localStorage.getItem('selectedLanguage') || 'en',
      });

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const role = userSnap.data()?.role || 'advocate';
      navigate(getRouteForRole(role));
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
          <p className="eyebrow">{t('firstTimeSetup')}</p>
          <h1>{t('profileSetup')}</h1>
          <p className="auth-subtitle">{t('profileSubtitle')}</p>
        </section>
        <div className="auth-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t('name')}:</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('phone')}:</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('address')}:</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('profilePic')}:</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
            <button type="submit" className="button">{t('save')}</button>
            {error ? <p className="error-text">{error}</p> : null}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
