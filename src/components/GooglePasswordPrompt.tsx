import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { linkWithCredential, EmailAuthProvider } from 'firebase/auth';
import { KeyRound, Eye, EyeOff, Check, X, ShieldCheck, AlertCircle } from 'lucide-react';

export function GooglePasswordPrompt() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsOpen(false);
      return;
    }

    // Must be Google user
    const hasGoogle = user.providerData.some(p => p.providerId === 'google.com');
    // Must NOT have a password provider
    const hasPassword = user.providerData.some(p => p.providerId === 'password');

    // Check if dismissed
    const dismissed = localStorage.getItem(`dismissed_password_setup_${user.uid}`);

    if (hasGoogle && !hasPassword && !dismissed) {
      // Small timeout to not show immediately on first mount
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
    }
  }, [user]);

  if (!isOpen) return null;

  const handleDismiss = (permanently = false) => {
    if (user) {
      if (permanently) {
        localStorage.setItem(`dismissed_password_setup_${user.uid}`, 'permanent');
      } else {
        // Just for this session or 24 hours
        localStorage.setItem(`dismissed_password_setup_${user.uid}`, 'temp');
      }
    }
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError('Please fill in check fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const credential = EmailAuthProvider.credential(user!.email!, password);
      await linkWithCredential(user!, credential);
      
      setSuccess(true);
      setTimeout(() => {
        // Add item to local storage so we don't show it again
        localStorage.setItem(`dismissed_password_setup_${user!.uid}`, 'permanent');
        setIsOpen(false);
      }, 3000);
    } catch (err: any) {
      console.error('Error linking password credential:', err);
      let errMsg = err.message || 'Failed to set password.';
      if (err.code === 'auth/credential-already-in-use') {
        errMsg = 'This email is already associated with password login.';
      } else if (err.code === 'auth/requires-recent-login') {
        errMsg = 'Security check: Please log out and back in to set a password.';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-full max-w-sm bg-zinc-900 border border-zinc-850 rounded-2xl p-5 shadow-2xl animate-fade-in text-zinc-100 ring-1 ring-indigo-500/10">
      {!showForm ? (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 flex-shrink-0 border border-indigo-500/15">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-white text-sm">Add a Security Password?</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Set a password so you can sign in using your email directly, even without Google.
              </p>
            </div>
            <button 
              onClick={() => handleDismiss(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1 text-xs font-semibold">
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer text-center"
            >
              Yes, Set Password
            </button>
            <button
              onClick={() => handleDismiss(true)}
              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-450 hover:text-white transition-colors cursor-pointer"
            >
              Don't ask again
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
            <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Set Password
            </h4>
            <button 
              type="button"
              onClick={() => setShowForm(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {success ? (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              Password set successfully! Next time you can use either Google or password.
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl text-xs flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-650 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 focus:border-indigo-500 transition-all pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-650 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2 text-xs font-semibold">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Save Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-450 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
