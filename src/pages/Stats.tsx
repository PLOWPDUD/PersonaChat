import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Users, Loader2, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Stats() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<{ visitorCount: number; userCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statsRef = doc(db, 'siteStats', 'global');
        const statsSnap = await getDoc(statsRef);
        if (statsSnap.exists()) {
          setStats(statsSnap.data() as { visitorCount: number; userCount: number });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
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
