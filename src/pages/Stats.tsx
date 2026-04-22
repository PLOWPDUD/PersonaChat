import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Users, Loader2, User, AlertCircle, ShieldAlert, Award, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export function Stats() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, quotaExceeded: globalQuotaExceeded } = useAuth();
  const [stats, setStats] = useState<{ visitorCount: number; userCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localQuotaExceeded, setLocalQuotaExceeded] = useState(false);

  const quotaExceeded = globalQuotaExceeded || localQuotaExceeded;

  useEffect(() => {
    const statsRef = doc(db, 'siteStats', 'global');
    
    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(statsRef, (doc) => {
      console.log("Stats snapshot received:", doc.exists() ? doc.data() : "Document does not exist");
      if (doc.exists()) {
        setStats(doc.data() as { visitorCount: number; userCount: number });
      } else {
        setStats({ visitorCount: 0, userCount: 0 });
      }
      setLoading(false);
      setError(null);
    }, (error: any) => {
      console.error('Error listening to stats:', error);
      if (isQuotaError(error)) {
        setLocalQuotaExceeded(true);
      } else {
        setError(t('stats.loadError'));
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [t]);

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
        <h2 className="text-xl font-bold text-white mb-2">{t('common.quotaWarnHome')}</h2>
        <p className="text-zinc-400 mb-6">
          {t('stats.quotaLimitDesc')}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="text-indigo-400 hover:text-indigo-300 font-medium"
        >
          {t('common.tryReloading', 'Try reloading')}
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
          {t('common.tryReloading', 'Try reloading')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('stats.dashboardTitle')}</h1>
          <p className="text-zinc-400 mt-1">{t('stats.dashboardSub')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Stats Card */}
        <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <Users className="w-32 h-32 text-indigo-500" />
          </div>
          <div className="relative z-10">
            <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-widest mb-6">{t('stats.communityGrowth')}</h3>
            <div className="flex items-end gap-8">
              <div>
                <p className="text-5xl font-bold text-white tracking-tighter">{stats?.userCount || 0}</p>
                <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mt-2">{t('stats.totalMembers')}</p>
              </div>
              <div className="h-12 w-px bg-zinc-800" />
              <div>
                <p className="text-5xl font-bold text-white tracking-tighter">{stats?.visitorCount || 0}</p>
                <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mt-2">{t('stats.totalVisitors')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-indigo-600 rounded-3xl p-6 text-white flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -bottom-4 -right-4 opacity-20 group-hover:scale-110 transition-transform duration-500">
            <User className="w-32 h-32" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/20" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20">
                  <User className="w-6 h-6" />
                </div>
              )}
              <div>
                <p className="font-bold truncate">{profile?.displayName || t('common.user')}</p>
                <p className="text-indigo-200 text-xs">{t('common.level')} {profile?.level || 1}</p>
              </div>
            </div>
            <p className="text-indigo-100 text-sm leading-relaxed">
              {t('stats.xpNote')}
            </p>
          </div>
          <button 
            onClick={() => navigate('/profile')}
            className="mt-6 w-full py-3 bg-white text-indigo-600 rounded-2xl text-sm font-bold hover:bg-indigo-50 transition-colors relative z-10"
          >
            {t('stats.viewProfile')}
          </button>
        </div>

        {/* Small Cards */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-center items-center text-center">
          <div className="p-3 bg-amber-500/10 rounded-2xl mb-3">
            <Award className="w-6 h-6 text-amber-500" />
          </div>
          <p className="text-white font-bold">{profile?.badges?.length || 0}</p>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">{t('stats.badgesEarned')}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-center items-center text-center">
          <div className="p-3 bg-purple-500/10 rounded-2xl mb-3">
            <Users className="w-6 h-6 text-purple-500" />
          </div>
          <p className="text-white font-bold">{profile?.followersCount || 0}</p>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">{t('stats.followers')}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-center items-center text-center">
          <div className="p-3 bg-green-500/10 rounded-2xl mb-3">
            <Zap className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-white font-bold">{profile?.xp || 0}</p>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">{t('stats.totalXp')}</p>
        </div>
      </div>
    </div>
  );
}
