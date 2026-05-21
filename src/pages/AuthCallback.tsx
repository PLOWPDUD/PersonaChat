import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const handleAuth = async () => {
      const credsParam = searchParams.get('creds');
      const token = searchParams.get('token');

      if (!credsParam && !token) {
        setError('No authentication credentials provided');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      try {
        console.log('Completing custom credential sign-in on WebView...');
        let credential;
        if (credsParam) {
          const parsedCreds = JSON.parse(decodeURIComponent(credsParam));
          credential = GoogleAuthProvider.credential(parsedCreds.idToken, parsedCreds.accessToken);
        } else {
          // Fallback legacy behavior if no creds but a token was passed
          credential = GoogleAuthProvider.credential(token);
        }
        await signInWithCredential(auth, credential);
        console.log('WebView signed in successfully!');
        navigate('/', { replace: true });
      } catch (err: any) {
        console.error('Error signing in with credential:', err);
        setError(err.message || 'Failed to authenticate app session');
        setTimeout(() => navigate('/login'), 4000);
      }
    };

    handleAuth();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      
      <div className="z-10 w-full max-w-sm bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
              ✕
            </div>
            <h2 className="text-xl font-bold text-white">Authentication Failed</h2>
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-zinc-500 text-xs">Redirecting to login screen...</p>
          </>
        ) : (
          <>
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
            <h2 className="text-xl font-bold text-white">Syncing PersonaChat App...</h2>
            <p className="text-zinc-400 text-sm">Initializing your secure session. Please wait a moment.</p>
          </>
        )}
      </div>
    </div>
  );
}
