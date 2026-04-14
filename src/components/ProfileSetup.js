import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { auth, db, storage } from '../firebase';
import { getRouteForRole } from '../utils/auth';
import { isAdvocateDraftReady } from '../utils/draftingProfiles';

const ProfileSetup = () => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [profilePic, setProfilePic] = useState(null);
  const [existingProfilePicUrl, setExistingProfilePicUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('advocate');
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    setProfilePic(e.target.files[0]);
  };

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) {
        if (active) setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const profile = userSnap.data() || {};

      if (!active) return;
      setUserRole(profile.role || 'advocate');
      setName(profile.name || user.displayName || '');
      setPhone(profile.phone || '');
      setOfficeAddress(profile.officeAddress || profile.address || '');
      setEnrollmentNumber(profile.enrollmentNumber || '');
      setEmail(profile.email || user.email || '');
      setExistingProfilePicUrl(profile.profilePicUrl || '');
      setLoading(false);
    };

    loadProfile().catch(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

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

      const nextProfile = {
        name,
        phone,
        officeAddress,
        address: officeAddress,
        enrollmentNumber,
        email: email || user.email || '',
        profilePicUrl: profilePicUrl || existingProfilePicUrl,
        preferredLanguage: localStorage.getItem('selectedLanguage') || 'en',
      };

      await updateDoc(doc(db, 'users', user.uid), {
        ...nextProfile,
        profileComplete: userRole === 'admin' ? true : isAdvocateDraftReady(nextProfile),
      });

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const nextRole = userSnap.data()?.role || 'advocate';
      navigate(getRouteForRole(nextRole));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
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
            <p className="helper-text">{t('loadingWorkspace')}</p>
          </div>
        </div>
      </div>
    );
  }

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
              <label>{t('enrollmentNumber')}:</label>
              <input
                type="text"
                value={enrollmentNumber}
                onChange={(e) => setEnrollmentNumber(e.target.value)}
                required
              />
            </div>
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
              <label>{t('officeAddress')}:</label>
              <textarea
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
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
