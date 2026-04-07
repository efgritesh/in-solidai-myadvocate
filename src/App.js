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
import Hearings from './components/Hearings';
import Payments from './components/Payments';
import Documents from './components/Documents';
import Invite from './components/Invite';
import CaseAccess from './components/CaseAccess';

function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('appName');
    document.documentElement.lang = i18n.language || 'en';
  }, [i18n.language, t]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LanguageSelection />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/profile-setup" element={<ProfileSetup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/case-access/:token" element={<CaseAccess />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:caseId" element={<CaseDetails />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/hearings" element={<Hearings />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/invite" element={<Invite />} />
      </Routes>
    </Router>
  );
}

export default App;
