import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { signInWithGoogle, signInAnonymously, auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { BrandLogo } from '../components/BrandLogo';
import { Sparkles, UserCircle, Mail, Lock, ArrowLeft, Eye, EyeOff, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Login() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Auth flow states
  const [authMode, setAuthMode] = useState<'social' | 'signin' | 'signup'>('social');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('trigger_google') === 'true') {
      localStorage.setItem('auth_from_app', 'true');
      window.history.replaceState({}, document.title, window.location.pathname);
      handleGoogleSignIn();
    }
  }, []);

  const fromApp = localStorage.getItem('auth_from_app') === 'true';

  if (user && !fromApp) {
    return <Navigate to="/" replace />;
  }

  if (user && fromApp) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        
        <div className="z-10 w-full max-w-sm bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
          <h2 className="text-xl font-bold text-white">Signing In...</h2>
          <p className="text-zinc-400 text-sm">Transferring session to your PersonaChat mobile app. If you are not redirected automatically, click the button below.</p>
          <button 
            onClick={async () => {
              try {
                const idToken = await user.getIdToken();
                window.location.href = `personachat://auth-callback?token=${encodeURIComponent(idToken)}`;
              } catch (e) {
                console.error(e);
              }
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-500/15"
          >
            Open PersonaChat App
          </button>
        </div>
      </div>
    );
  }

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setIsLoading(true);
      await signInWithGoogle();
      if (localStorage.getItem('auth_from_app') !== 'true') {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    try {
      setError('');
      setIsLoading(true);
      await signInAnonymously();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in as guest');
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    try {
      setError('');
      setIsLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/');
    } catch (err: any) {
      let friendlyMessage = err.message;
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        friendlyMessage = 'Invalid email or password.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      }
      setError(friendlyMessage || 'Failed to sign in');
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword || !displayName) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      setError('');
      setIsLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Wait for name to be updated on standard profile
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: displayName.trim() });
      }
      navigate('/');
    } catch (err: any) {
      let friendlyMessage = err.message;
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'An account with this email already exists.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = 'The password is too weak.';
      }
      setError(friendlyMessage || 'Failed to sign up');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      
      <div className="z-10 w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl transition-all">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/10 border border-zinc-700">
            <BrandLogo className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 text-center">{t('common.appName')}</h1>
          <p className="text-zinc-400 text-center flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            {authMode === 'social' && t('common.loginTagline')}
            {authMode === 'signin' && 'Sign in to your account'}
            {authMode === 'signup' && 'Create your account'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {authMode === 'social' && (
          <div className="space-y-4 animate-fade-in">
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isLoading ? 'Signing in...' : 'Continue with Google'}
            </button>

            <button
              onClick={handleGuestSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700 cursor-pointer shadow-md"
            >
              <UserCircle className="w-5 h-5 text-zinc-400" />
              {isLoading ? 'Signing in...' : 'Continue as Guest'}
            </button>

            <div className="relative flex items-center justify-center my-6">
              <div className="absolute inset-0 border-t border-zinc-800"></div>
              <span className="relative px-3 bg-zinc-900 text-xs text-zinc-500 font-medium uppercase tracking-widest">or</span>
            </div>

            <button
              onClick={() => {
                setError('');
                setAuthMode('signin');
              }}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-500/10"
            >
              <Mail className="w-4 h-4" />
              Sign In with Email & Password
            </button>
          </div>
        )}

        {authMode === 'signin' && (
          <form onSubmit={handleEmailSignIn} className="space-y-4 animate-fade-in text-zinc-300">
            <div className="space-y-2">
              <label htmlFor="signin-email" className="block text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="email"
                  id="signin-email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center pl-1">
                <label htmlFor="signin-password" className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signin-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-12 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-indigo-500/15"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>

            <div className="flex flex-col gap-3 pt-2 text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setAuthMode('signup');
                }}
                className="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
              >
                Don't have an account? Sign Up
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setAuthMode('social');
                }}
                className="inline-flex items-center justify-center gap-1.5 text-zinc-500 hover:text-zinc-400 cursor-pointer font-medium mt-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Google & Guest
              </button>
            </div>
          </form>
        )}

        {authMode === 'signup' && (
          <form onSubmit={handleEmailSignUp} className="space-y-4 animate-fade-in text-zinc-300">
            <div className="space-y-2">
              <label htmlFor="signup-name" className="block text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  id="signup-name"
                  placeholder="John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-email" className="block text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="email"
                  id="signup-email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-password" className="block text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-12 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-confirm" className="block text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-confirm"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-12 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-indigo-500/15"
            >
              {isLoading ? 'Creating Account...' : 'Sign Up'}
            </button>

            <div className="flex flex-col gap-3 pt-2 text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setAuthMode('signin');
                }}
                className="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
              >
                Already have an account? Sign In
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setAuthMode('social');
                }}
                className="inline-flex items-center justify-center gap-1.5 text-zinc-500 hover:text-zinc-400 cursor-pointer font-medium mt-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Google & Guest
              </button>
            </div>
          </form>
        )}

        {authMode === 'social' && (
          <p className="mt-6 text-center text-xs text-zinc-500 leading-relaxed">
            {t('common.loginGuestWarn')}
          </p>
        )}
      </div>
    </div>
  );
}
