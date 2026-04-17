/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { LoadingScreen } from './components/LoadingScreen';
import { Login } from './pages/Login';
import { BannedScreen } from './pages/BannedScreen';
import { Home } from './pages/Home';
import { CreateCharacter } from './pages/CreateCharacter';
import { Personas } from './pages/Personas';
import { Profile } from './pages/Profile';
import { Chat } from './pages/Chat';
import { Stats } from './pages/Stats';
import { Search } from './pages/Search';
import { Admin } from './pages/Admin';
import { Settings } from './pages/Settings';
import { Reviews } from './pages/Reviews';
import { CreatorDashboard } from './pages/CreatorDashboard';
import PersonaCommunity from './pages/PersonaCommunity';
import Messages from './pages/Messages';
import { NotFound } from './pages/NotFound';
import { Rules } from './pages/Rules';

import { QuotaExceeded } from './components/QuotaExceeded';

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, quotaExceeded, isBanned } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }

  if (quotaExceeded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <QuotaExceeded />
      </div>
    );
  }
  
  if (isBanned) {
    return <BannedScreen />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/banned" element={<BannedScreen />} />
              
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Home />} />
                <Route path="search" element={<Search />} />
                <Route path="create" element={<CreateCharacter />} />
                <Route path="edit/:characterId" element={<CreateCharacter />} />
                <Route path="personas" element={<Personas />} />
                <Route path="profile" element={<Profile />} />
                <Route path="profile/:userId" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="stats" element={<Stats />} />
                <Route path="community" element={<PersonaCommunity />} />
                <Route path="rules" element={<Rules />} />
                <Route path="messages" element={<Messages />} />
                <Route path="admin" element={<Admin />} />
                <Route path="chat/:characterId" element={<Chat />} />
                <Route path="chat/:characterId/:chatId" element={<Chat />} />
                <Route path="reviews/:characterId" element={<Reviews />} />
                <Route path="dashboard" element={<CreatorDashboard />} />
              </Route>
              
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
