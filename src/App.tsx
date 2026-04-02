/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { CreateCharacter } from './pages/CreateCharacter';
import { Personas } from './pages/Personas';
import { Profile } from './pages/Profile';
import { Chat } from './pages/Chat';
import { Search } from './pages/Search';
import { NotFound } from './pages/NotFound';

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
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
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
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
              <Route path="chat/:characterId" element={<Chat />} />
              <Route path="chat/:characterId/:chatId" element={<Chat />} />
            </Route>
            
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
