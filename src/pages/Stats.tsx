import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Users, Loader2, User, AlertCircle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Stats() {
  const { user, profile, quotaExceeded: globalQuotaExceeded } = useAuth();
  const [stats, setStats] = useState<{ visitorCount: number; userCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localQuotaExceeded, setLocalQuotaExceeded] = useState(false);

  const quotaExceeded = globalQuotaExceeded || localQuotaExceeded;

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const statsRef = doc(db, 'siteStats', 'global');
        const statsSnap = await getDoc(statsRef);
        
        if (statsSnap.exists()) {
          setStats(statsSnap.data() as { visitorCount: number; userCount: number });
        }
      } catch (error: any) {
        console.error('Error fetching stats:', error);
        if (isQuotaError(error)) {
          setLocalQuotaExceeded(true);
        } else {
          handleFirestoreError(error, OperationType.GET, 'siteStats/global');
          setError('Failed to load statistics.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (quotaExceeded) {
    return (
      <div className="max-w-2xl mx-auto p-12 bg-zinc-900 border border-zinc-800 rounded-3xl text-center">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Quota Limit Reached</h2>
        <p className="text-zinc-400 mb-6">
          The website has reached its daily data limit for the free tier. 
          Statistics are temporarily unavailable. Please check back tomorrow!
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Try reloading
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-12 bg-zinc-900 border border-zinc-800 rounded-3xl text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Try reloading
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-zinc-900 border border-zinc-800 rounded-3xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-500/10 rounded-2xl">
          <Users className="w-8 h-8 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Website Statistics</h1>
          <p className="text-zinc-400">Total users and visitors to this site</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-2">Total Users</p>
          <p className="text-5xl font-bold text-white tracking-tight">{stats?.userCount || 0}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-2">Total Visitors</p>
          <p className="text-5xl font-bold text-white tracking-tight">{stats?.visitorCount || 0}</p>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
        {profile?.photoURL ? (
          <img src={profile.photoURL} alt="Profile" className="w-16 h-16 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
            <User className="w-8 h-8 text-zinc-400" />
          </div>
        )}
        <div>
          <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Current User</p>
          <p className="text-2xl font-bold text-white">
            {user?.isAnonymous ? 'Guest' : (profile?.displayName || 'User')}
          </p>
        </div>
      </div>
    </div>
  );
}
