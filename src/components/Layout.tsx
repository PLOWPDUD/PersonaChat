import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logOut } from '../lib/firebase';
import { MessageSquare, PlusCircle, LogOut, User as UserIcon, Search, UserCircle } from 'lucide-react';

export function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
            <MessageSquare className="w-6 h-6 text-indigo-500" />
            <span>PersonaChat</span>
          </Link>
          
          {user && (
            <nav className="flex items-center gap-4">
              <Link 
                to="/search" 
                className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
              </Link>

              <Link 
                to="/create" 
                className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Create Character</span>
              </Link>

              <Link 
                to="/personas" 
                className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Personas</span>
              </Link>
              
              <div className="h-6 w-px bg-zinc-800 mx-2"></div>
              
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                  <p className="text-xs font-medium text-white">{user.displayName || 'Guest User'}</p>
                  <p className="text-[10px] text-zinc-500">{user.isAnonymous ? 'Temporary Account' : user.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <UserIcon className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
                <button 
                  onClick={handleLogout}
                  className="text-zinc-400 hover:text-white transition-colors p-2 rounded-full hover:bg-zinc-800"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </nav>
          )}
        </div>
      </header>
      
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
