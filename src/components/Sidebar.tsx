import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, PlusCircle, Search, UserCircle, Home, User, Users, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Sidebar() {
  const location = useLocation();
  const { user, profile, isModerator, logOut } = useAuth();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search', icon: Search },
    { path: '/create', label: 'Create', icon: PlusCircle },
    { path: '/personas', label: 'Personas', icon: UserCircle },
    { path: '/stats', label: 'Stats', icon: Users },
  ];

  if (isModerator) {
    navItems.push({ path: '/admin', label: 'Admin', icon: Shield });
  }

  return (
    <>
      <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
            <MessageSquare className="w-8 h-8 text-indigo-500" />
            <span>PersonaChat</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                location.pathname === item.path
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-2">
          <Link to="/profile" className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-900 transition-colors">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <User className="w-5 h-5 text-zinc-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.isAnonymous ? 'Guest' : (profile?.displayName || 'User')}
              </p>
            </div>
          </Link>
          <button
            onClick={() => logOut()}
            className="w-full flex items-center gap-3 p-2 rounded-xl text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </>
  );
}
