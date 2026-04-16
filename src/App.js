import React, { useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSelection from './components/LanguageSelection';
import AppEntry from './components/AppEntry';
import Login from './components/Login';
import SignUp from './components/SignUp';
import ProfileSetup from './components/ProfileSetup';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import Cases from './components/Cases';
import CaseDetails from './components/CaseDetails';
import Clients from './components/Clients';
import ClientDetails from './components/ClientDetails';
import Hearings from './components/Hearings';
import Payments from './components/Payments';
import Documents from './components/Documents';
import Invite from './components/Invite';
import CaseAccess from './components/CaseAccess';
import About from './components/About';
import DraftingAssistant from './components/DraftingAssistant';
import PremiumUpgrade from './components/PremiumUpgrade';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards';
import { shouldForceOpenInstalledApp } from './utils/pwa';

const AppRoutes = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [updateRegistration, setUpdateRegistration] = React.useState(null);
  const [updateReady, setUpdateReady] = React.useState(false);

  useEffect(() => {
    const handleUpdateReady = (event) => {
      if (event.detail?.registration) {
        setUpdateRegistration(event.detail.registration);
        setUpdateReady(true);
      }
    };

    const handleControllerChange = () => {
      window.location.reload();
    };

    const checkForUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker?.ready;
        if (!registration) {
          return;
        }

        await registration.update();

        if (registration.waiting) {
          setUpdateRegistration(registration);
          setUpdateReady(true);
        }
      } catch (error) {
        // Ignore update check failures and try again later.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    window.addEventListener('iadvocate-update-ready', handleUpdateReady);
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const initialTimer = window.setTimeout(checkForUpdate, 2500);
    const interval = window.setInterval(checkForUpdate, 45000);

    return () => {
      window.removeEventListener('iadvocate-update-ready', handleUpdateReady);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  const refreshToLatest = () => {
    if (updateRegistration?.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    window.location.reload();
  };

  const browserLocked =
    shouldForceOpenInstalledApp() &&
    !location.pathname.startsWith('/case-access/') &&
    location.pathname !== '/about';

  if (browserLocked) {
    return <AppEntry browserLocked />;
  }

  return (
    <>
      {updateReady ? (
        <div className="app-modal">
          <button type="button" className="app-modal__scrim" aria-label={t('closeNavigation')} onClick={() => setUpdateReady(false)} />
          <div className="app-modal__surface">
            <p className="eyebrow">{t('updateAvailableEyebrow')}</p>
            <h2>{t('updateAvailableTitle')}</h2>
            <p>{t('updateAvailableBody')}</p>
            <div className="button-row top-space">
              <button type="button" className="button" onClick={refreshToLatest}>
                {t('updateNow')}
              </button>
              <button type="button" className="button button--secondary" onClick={() => setUpdateReady(false)}>
                {t('later')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<PublicOnlyRoute><AppEntry /></PublicOnlyRoute>} />
        <Route path="/language" element={<PublicOnlyRoute><LanguageSelection /></PublicOnlyRoute>} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><SignUp /></PublicOnlyRoute>} />
        <Route path="/profile-setup" element={<ProtectedRoute allowIncomplete><ProfileSetup /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute allowedRoles={['advocate']}><ProfileSetup /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['advocate']}><Dashboard /></ProtectedRoute>} />
        <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/case-access/:token" element={<CaseAccess />} />
        <Route path="/cases" element={<ProtectedRoute allowedRoles={['advocate']}><Cases /></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute allowedRoles={['advocate']}><CaseDetails /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute allowedRoles={['advocate']}><Clients /></ProtectedRoute>} />
        <Route path="/clients/:clientId" element={<ProtectedRoute allowedRoles={['advocate']}><ClientDetails /></ProtectedRoute>} />
        <Route path="/premium" element={<ProtectedRoute allowedRoles={['advocate']}><PremiumUpgrade /></ProtectedRoute>} />
        <Route
          path="/drafting"
          element={
            <ProtectedRoute allowedRoles={['advocate']}>
              <DraftingAssistant />
            </ProtectedRoute>
          }
        />
        <Route path="/hearings" element={<ProtectedRoute allowedRoles={['advocate']}><Hearings /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute allowedRoles={['advocate']}><Payments /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute allowedRoles={['advocate']}><Documents /></ProtectedRoute>} />
        <Route path="/invite" element={<ProtectedRoute allowedRoles={['advocate']}><Invite /></ProtectedRoute>} />
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  );
};

function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('appName');
    document.documentElement.lang = i18n.language || 'en';
  }, [i18n.language, t]);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
