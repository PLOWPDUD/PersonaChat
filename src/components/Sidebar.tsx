import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, PlusCircle, Search, UserCircle, Home, User, Users, Shield, LogOut, X, Settings, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const { user, profile, isOwner, isModerator, logOut } = useAuth();

  const getRankInfo = () => {
    if (isOwner) return { label: 'Owner', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    if (isModerator) return { label: 'Mod', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
    if (user?.isAnonymous) return { label: 'Guest', color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };
    return { label: 'User', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' };
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search', icon: Search },
    { path: '/create', label: 'Create', icon: PlusCircle },
    { path: '/personas', label: 'Personas', icon: UserCircle },
    { path: '/community', label: 'Community', icon: Globe },
    { path: '/stats', label: 'Stats', icon: Users },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/admin', label: 'Admin', icon: Shield },
  ];

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <div className="w-full bg-zinc-950 border-r border-zinc-800 flex flex-col h-full overflow-y-auto">
      <div className="p-6 flex items-center justify-between">
        <Link to="/" onClick={handleNavClick} className="flex items-center gap-2 text-xl font-bold text-white">
          <MessageSquare className="w-8 h-8 text-theme-primary" />
          <span>PersonaChat</span>
        </Link>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={handleNavClick}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              location.pathname === item.path
                ? 'bg-theme-primary/10 text-theme-primary'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800 space-y-2">
        <Link to="/profile" onClick={handleNavClick} className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-900 transition-colors">
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
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border mt-1 inline-block ${getRankInfo().color}`}>
              {getRankInfo().label}
            </span>
          </div>
        </Link>
        <button
          onClick={() => {
            logOut();
            handleNavClick();
          }}
          className="w-full flex items-center gap-3 p-2 rounded-xl text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm font-medium"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
}
