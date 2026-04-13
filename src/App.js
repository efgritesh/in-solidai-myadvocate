import React, { useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSelection from './components/LanguageSelection';
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

function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('appName');
    document.documentElement.lang = i18n.language || 'en';
  }, [i18n.language, t]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<PublicOnlyRoute><LanguageSelection /></PublicOnlyRoute>} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><SignUp /></PublicOnlyRoute>} />
        <Route path="/profile-setup" element={<ProtectedRoute allowIncomplete><ProfileSetup /></ProtectedRoute>} />
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
            <ProtectedRoute allowedRoles={['advocate']} requirePremium premiumFallback="/premium?feature=drafting">
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
    </Router>
  );
}

export default App;
