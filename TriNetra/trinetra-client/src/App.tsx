import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';

// Authenticated Pages
import Dashboard from './pages/Dashboard';
import AskTriNetra from './pages/AskTriNetra';
import CaseExplorer from './pages/CaseExplorer';
import NetworkAnalysis from './pages/NetworkAnalysis';
import CrimeAnalytics from './pages/CrimeAnalytics';
import OffenderProfiles from './pages/OffenderProfiles';
import PreventionAlerts from './pages/PreventionAlerts';
import Profile from './pages/Profile';


function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated Routes with AppShell */}
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ask" element={<AskTriNetra />} />
        <Route path="/cases" element={<CaseExplorer />} />
        <Route path="/network" element={<NetworkAnalysis />} />
        <Route path="/analytics" element={<CrimeAnalytics />} />
        <Route path="/offenders" element={<OffenderProfiles />} />
        <Route path="/alerts" element={<PreventionAlerts />} />
        
        <Route path="/profile" element={<Profile />} />
        
        {/* Redirect unknown auth routes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;