import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, orderBy, serverTimestamp, where, getDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ShieldAlert, ShieldCheck, User, Check, X, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Admin() {
  const { user, isOwner, isModerator } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'reports' | 'settings' | 'privateCharacters'>('reports');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [privateCharacters, setPrivateCharacters] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isModerator) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'users' && isOwner) {
          const q = query(collection(db, 'profiles'), orderBy('createdAt', 'desc'), limit(50));
          const snap = await getDocs(q);
          setProfiles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } else if (activeTab === 'reports') {
          const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50));
          const snap = await getDocs(q);
          setReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } else if (activeTab === 'privateCharacters' && isModerator) {
          const q = query(collection(db, 'characters'), where('visibility', '==', 'private'), limit(50));
          const snap = await getDocs(q);
          setPrivateCharacters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } else if (activeTab === 'settings' && isOwner) {
          const settingsSnap = await getDoc(doc(db, 'settings', 'config'));
          if (settingsSnap.exists()) {
            setSettings(settingsSnap.data());
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, activeTab);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOwner, isModerator, activeTab, navigate]);

  const handleToggleModeratorPrivate = async () => {
    if (!isOwner) return;
    setUpdatingId('moderatorCanSeePrivate');
    try {
      const settingsRef = doc(db, 'settings', 'config');
      await setDoc(settingsRef, { moderatorCanSeePrivate: !settings.moderatorCanSeePrivate }, { merge: true });
      setSettings(prev => ({ ...prev, moderatorCanSeePrivate: !prev.moderatorCanSeePrivate }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/config');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!isOwner) return;
    setUpdatingId(userId);
    try {
      const profileRef = doc(db, 'profiles', userId);
      await setDoc(profileRef, { role: newRole, updatedAt: serverTimestamp() }, { merge: true });
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${userId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReportStatus = async (reportId: string, newStatus: string) => {
    if (!isOwner) return;
    setUpdatingId(reportId);
    try {
      const reportRef = doc(db, 'reports', reportId);
      await setDoc(reportRef, { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isModerator) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Shield className="w-8 h-8 text-indigo-500" />
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-zinc-400">Manage users and review reports.</p>
        </div>
      </div>

      <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 w-fit">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'reports' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Reports
        </button>
        {isOwner && (
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'users' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Users
          </button>
        )}
        {isOwner && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Settings
          </button>
        )}
        <button
          onClick={() => setActiveTab('privateCharacters')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'privateCharacters' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Private Characters
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : activeTab === 'users' && isOwner ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-800/50 text-zinc-300">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {profiles.map(profile => (
                <tr key={profile.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-3">
                    {profile.photoURL ? (
                      <img src={profile.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                        <User className="w-4 h-4 text-zinc-500" />
                      </div>
                    )}
                    <span className="text-white font-medium">{profile.displayName}</span>
                  </td>
                  <td className="px-6 py-4">{profile.email || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      profile.role === 'owner' ? 'bg-purple-500/10 text-purple-400' :
                      profile.role === 'moderator' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-zinc-800 text-zinc-300'
                    }`}>
                      {profile.role || 'user'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <select
                      value={profile.role || 'user'}
                      onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                      disabled={updatingId === profile.id || profile.email === 'videosonli5@gmail.com'}
                      className="bg-zinc-800 text-zinc-300 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="moderator">Moderator</option>
                      <option value="owner">Owner</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'privateCharacters' && isModerator ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {privateCharacters.map(char => (
            <div key={char.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
              {char.avatarUrl ? (
                <img src={char.avatarUrl} alt={char.name} className="w-16 h-16 rounded-xl object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center">
                  <User className="w-8 h-8 text-zinc-500" />
                </div>
              )}
              <div>
                <h3 className="text-white font-bold">{char.name}</h3>
                <p className="text-zinc-400 text-sm">Creator: {char.creatorId}</p>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'settings' && isOwner ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Moderator Access to Private Characters</p>
              <p className="text-zinc-400 text-sm">Allow moderators to view private characters.</p>
            </div>
            <button
              onClick={handleToggleModeratorPrivate}
              disabled={updatingId === 'moderatorCanSeePrivate'}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                settings.moderatorCanSeePrivate ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-300'
              }`}
            >
              {updatingId === 'moderatorCanSeePrivate' ? <Loader2 className="w-4 h-4 animate-spin" /> : settings.moderatorCanSeePrivate ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/50 rounded-3xl border border-zinc-800 border-dashed">
              <ShieldCheck className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No reports to review.</p>
            </div>
          ) : (
            reports.map(report => (
              <div key={report.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row gap-6 justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      report.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                      report.status === 'reviewed' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-green-500/10 text-green-400'
                    }`}>
                      {report.status.toUpperCase()}
                    </span>
                    <span className="text-zinc-500 text-sm">
                      {report.type === 'character' ? 'Character Report' : 'User Report'}
                    </span>
                  </div>
                  <p className="text-white font-medium">Target ID: <span className="font-mono text-indigo-400">{report.targetId}</span></p>
                  <p className="text-zinc-300 bg-zinc-950 p-3 rounded-xl border border-zinc-800">{report.reason}</p>
                  <p className="text-xs text-zinc-500">Reported by: {report.reporterId}</p>
                </div>
                
                {isOwner && (
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    {report.status === 'pending' && (
                      <button
                        onClick={() => handleReportStatus(report.id, 'reviewed')}
                        disabled={updatingId === report.id}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Mark Reviewed
                      </button>
                    )}
                    {report.status !== 'resolved' && (
                      <button
                        onClick={() => handleReportStatus(report.id, 'resolved')}
                        disabled={updatingId === report.id}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
