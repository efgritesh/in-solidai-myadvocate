import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { auth, db, storage } from '../firebase';
import { getRouteForRole } from '../utils/auth';
import { isAdvocateDraftReady } from '../utils/draftingProfiles';

const ProfileSetup = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
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
  const [saving, setSaving] = useState(false);

  const isProfileReview = location.pathname === '/profile';
  const profileTitle = isProfileReview ? t('myProfile') : t('profileSetup');
  const initials = useMemo(() => {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'IA';
    return trimmed.charAt(0).toUpperCase();
  }, [name]);

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
    setSaving(true);
    setError('');

    try {
      const user = auth.currentUser;
      const userRef = doc(db, 'users', user.uid);
      const currentSnap = await getDoc(userRef);
      const currentProfile = currentSnap.data() || {};
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

      await setDoc(userRef, {
        ...currentProfile,
        uid: currentProfile.uid || user.uid,
        role: currentProfile.role || userRole,
        ...nextProfile,
        profileComplete: userRole === 'admin' ? true : isAdvocateDraftReady(nextProfile),
      }, { merge: false });

      const userSnap = await getDoc(userRef);
      const nextRole = userSnap.data()?.role || 'advocate';
      navigate(getRouteForRole(nextRole));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-layout auth-layout--compact">
          <div className="auth-card auth-card--profile">
            <p className="helper-text">{t('loadingWorkspace')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-layout auth-layout--compact">
        <div className="auth-card auth-card--profile">
          <div className="profile-editor">
            <div className="profile-editor__header">
              <div>
                <p className="eyebrow">{isProfileReview ? t('myProfile') : t('firstTimeSetup')}</p>
                <h1>{profileTitle}</h1>
              </div>
            </div>
            <div className="profile-avatar">
              <div className="profile-avatar__frame">
                {existingProfilePicUrl ? (
                  <img src={existingProfilePicUrl} alt={name || t('profilePic')} className="profile-avatar__image" />
                ) : (
                  <span className="profile-avatar__initials">{initials}</span>
                )}
                <button
                  type="button"
                  className="profile-avatar__edit"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t('changePhoto')}
                >
                  <svg viewBox="0 0 24 24" className="app-icon" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="m16.5 3.5 4 4L7 21H3v-4z" />
                  </svg>
                </button>
              </div>
              <button type="button" className="inline-link" onClick={() => fileInputRef.current?.click()}>
                {existingProfilePicUrl ? t('changePhoto') : t('uploadPhoto')}
              </button>
            </div>
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
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                {profilePic ? <p className="helper-text top-space">{profilePic.name}</p> : null}
              </div>
              <button type="submit" className="button" disabled={saving}>
                {saving ? t('saving') : t('save')}
              </button>
              {error ? <p className="error-text">{error}</p> : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
