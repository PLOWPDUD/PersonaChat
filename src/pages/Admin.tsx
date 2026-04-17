import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, orderBy, serverTimestamp, where, getDoc, limit, startAfter, addDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ShieldAlert, ShieldCheck, User, Check, X, Loader2, Trash2, ChevronRight, ChevronLeft, Search, Bot, Award } from 'lucide-react';
import { BADGES } from '../services/badgeService';
import { useNavigate } from 'react-router-dom';

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: string;
  badges?: string[];
  createdAt: any;
  characters?: any[];
}

export function Admin() {
  const { user, isOwner, isModerator } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'reports'>('users');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Pagination for Users
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [firstVisible, setFirstVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    if (isModerator) {
      fetchData();
    }
  }, [isModerator, activeTab, user]);

  const fetchData = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const profilesRef = collection(db, 'profiles');
        let q;
        const pageSize = 10;

        if (direction === 'next' && lastVisible) {
          q = query(profilesRef, orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(pageSize));
        } else if (direction === 'prev' && firstVisible) {
          // Firestore doesn't have a simple "prev" query without keeping track of all pages
          // For simplicity, we'll just reload or handle it if we have a stack of lastVisibles
          // But for now, let's just do basic next/initial
          q = query(profilesRef, orderBy('createdAt', 'desc'), limit(pageSize));
          setPage(1);
        } else {
          q = query(profilesRef, orderBy('createdAt', 'desc'), limit(pageSize));
          setPage(1);
        }

        const snap = await getDocs(q);
        const fetchedProfiles: UserProfile[] = snap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        } as UserProfile));
        
        setProfiles(fetchedProfiles);
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setFirstVisible(snap.docs[0]);
        setHasMore(snap.docs.length === pageSize);
      } else if (activeTab === 'reports') {
        const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        setReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, activeTab);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    setPage(p => p + 1);
    fetchData('next');
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchData('initial'); // Reset to first page for now as simple implementation
    }
  };

  const [banModal, setBanModal] = useState<{ userId: string; isOpen: boolean }>({ userId: '', isOpen: false });
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('60'); // minutes

  const handleBanUser = async (userId: string) => {
    if (!isModerator) return;
    setUpdatingId(userId);
    try {
      const expiresAt = banDuration === 'infinite' ? null : new Date(Date.now() + parseInt(banDuration) * 60000);
      const profileRef = doc(db, 'profiles', userId);
      await setDoc(profileRef, { 
        isBanned: true, 
        banReason, 
        banExpiresAt: expiresAt ? new Date(expiresAt) : null,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, isBanned: true } : p));
      setBanModal({ userId: '', isOpen: false });
      setBanReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${userId}`);
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

  const fetchUserCharacters = async (userId: string) => {
    setUpdatingId(userId);
    try {
      const charQ = query(collection(db, 'characters'), where('creatorId', '==', userId), limit(20));
      const charSnap = await getDocs(charQ);
      const userChars = charSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, characters: userChars } : p));
    } catch (error) {
      console.error('Error fetching user characters:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReportStatus = async (reportId: string, newStatus: string, targetCreatorId?: string, targetName?: string) => {
    setUpdatingId(reportId);
    try {
      const reportRef = doc(db, 'reports', reportId);
      await setDoc(reportRef, { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));

      // Notify creator
      if (targetCreatorId) {
        let title = '';
        let message = '';
        let type: 'character_reviewed' | 'character_banned' = 'character_reviewed';

        if (newStatus === 'reviewed') {
          title = 'Character Under Review';
          message = `Your character "${targetName || 'Unknown'}" is currently being reviewed by our moderation team.`;
        } else if (newStatus === 'resolved') {
          title = 'Report Resolved';
          message = `The report against your character "${targetName || 'Unknown'}" has been resolved. Action may have been taken to ensure community safety.`;
        } else if (newStatus === 'dismissed') {
          title = 'Report Dismissed';
          message = `The report against your character "${targetName || 'Unknown'}" was reviewed and dismissed. No action was taken.`;
        }

        if (title && message) {
          await addDoc(collection(db, 'notifications'), {
            userId: targetCreatorId,
            type,
            title,
            message,
            read: false,
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteCharacter = async (charId: string, creatorId: string, charName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${charName}"? This will also notify the creator.`)) return;
    setUpdatingId(charId);
    try {
      await deleteDoc(doc(db, 'characters', charId));
      
      // Notify creator
      await addDoc(collection(db, 'notifications'), {
        userId: creatorId,
        type: 'character_banned',
        title: 'Character Deleted',
        message: `Your character "${charName}" has been deleted for violating our community guidelines.`,
        read: false,
        createdAt: serverTimestamp()
      });

      // Refresh data
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `characters/${charId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm(`Are you sure you want to delete post "${postId}"?`)) return;
    setUpdatingId(postId);
    try {
      await deleteDoc(doc(db, 'community_posts', postId));
      alert('Post deleted successfully.');
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `community_posts/${postId}`);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isModerator) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-zinc-400">You do not have the required permissions to view this page. Only authorized moderators and the site owner can access the admin dashboard.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-8 w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl">
            <Shield className="w-8 h-8 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Admin Dashboard</h1>
            <p className="text-zinc-400">Moderator access granted.</p>
          </div>
        </div>

        <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'reports' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Reports
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
          <p className="text-zinc-500 animate-pulse">Fetching data...</p>
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {profiles.map(profile => (
              <div key={profile.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {profile.photoURL ? (
                      <img src={profile.photoURL} alt="" className="w-12 h-12 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                        <User className="w-6 h-6 text-zinc-500" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-white font-bold text-lg">{profile.displayName}</h3>
                      <p className="text-zinc-500 text-sm">{profile.email}</p>
                      {profile.badges && profile.badges.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {profile.badges.map((badgeId: string) => {
                            const badge = BADGES.find(b => b.id === badgeId);
                            if (!badge) return null;
                            return (
                              <span key={badgeId} className="text-xs" title={badge.label}>
                                {badge.icon}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      profile.role === 'owner' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      profile.role === 'moderator' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {profile.role || 'user'}
                    </span>
                    {isModerator && profile.email !== 'videosonli5@gmail.com' && (
                      <button
                        onClick={() => setBanModal({ userId: profile.id, isOpen: true })}
                        className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                      >
                        <ShieldAlert className="w-5 h-5" />
                      </button>
                    )}
                    {isOwner && profile.email !== 'videosonli5@gmail.com' && (
                      <select
                        value={profile.role || 'user'}
                        onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                        disabled={updatingId === profile.id}
                        className="bg-zinc-800 text-white text-sm rounded-xl px-4 py-2 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      >
                        <option value="user">User</option>
                        <option value="moderator">Moderator</option>
                        <option value="owner">Owner</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-zinc-900/50">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Characters ({profile.characters?.length || 0})
                    </h4>
                    {!profile.characters && (
                      <button
                        onClick={() => fetchUserCharacters(profile.id)}
                        disabled={updatingId === profile.id}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest flex items-center gap-1"
                      >
                        {updatingId === profile.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Load Characters'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {profile.characters && profile.characters.length > 0 ? (
                      profile.characters.map((char: any) => (
                        <div key={char.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between group hover:border-indigo-500/50 transition-all">
                          <div className="flex items-center gap-3 min-w-0">
                            {char.avatarUrl ? (
                              <img src={char.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-zinc-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-white text-sm font-bold truncate">{char.name}</p>
                              <p className="text-zinc-500 text-[10px] uppercase font-bold">{char.visibility}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteCharacter(char.id, profile.id, char.name)}
                            disabled={updatingId === char.id}
                            className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-zinc-600 text-sm italic">No characters created yet.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 pt-8">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-white font-bold bg-zinc-900 px-6 py-3 rounded-2xl border border-zinc-800">
              Page {page}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!hasMore}
              className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {reports.length === 0 ? (
            <div className="text-center py-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 border-dashed">
              <ShieldCheck className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 text-lg">All clear! No pending reports.</p>
            </div>
          ) : (
            reports.map(report => (
              <div key={report.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col sm:flex-row gap-6 justify-between items-start hover:border-indigo-500/30 transition-all">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      report.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                      report.status === 'reviewed' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      report.status === 'dismissed' ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20' :
                      'bg-green-500/10 text-green-400 border border-green-500/20'
                    }`}>
                      {report.status}
                    </span>
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                      {report.type} Report
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-white font-bold">
                      Target: <span className="text-indigo-400 font-mono text-sm">{report.targetId}</span>
                    </p>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                      <p className="text-zinc-300 text-sm leading-relaxed">{report.reason}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <User className="w-3 h-3" />
                    <span>Reported by: {report.reporterId}</span>
                    <span className="mx-2">•</span>
                    <span>{report.createdAt?.toDate ? new Date(report.createdAt.toDate()).toLocaleDateString() : 'Recently'}</span>
                  </div>
                </div>
                                  <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[160px]">
                    {report.type === 'post' && (
                      <button
                        onClick={() => handleDeletePost(report.targetId)}
                        disabled={updatingId === report.targetId}
                        className="w-full px-6 py-3 bg-red-600/10 text-red-400 hover:bg-red-600 hover:text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Post
                      </button>
                    )}
                    {report.status === 'pending' && (
                    <button
                      onClick={() => handleReportStatus(report.id, 'reviewed', report.creatorId, report.targetName)}
                      disabled={updatingId === report.id}
                      className="w-full px-6 py-3 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      Mark Reviewed
                    </button>
                  )}
                  {report.status !== 'resolved' && report.status !== 'dismissed' && (
                    <>
                      <button
                        onClick={() => handleReportStatus(report.id, 'resolved', report.creatorId, report.targetName)}
                        disabled={updatingId === report.id}
                        className="w-full px-6 py-3 bg-green-600/10 text-green-400 hover:bg-green-600 hover:text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                      >
                        Mark Resolved
                      </button>
                      <button
                        onClick={() => handleReportStatus(report.id, 'dismissed', report.creatorId, report.targetName)}
                        disabled={updatingId === report.id}
                        className="w-full px-6 py-3 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                      >
                        Dismiss Report
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {banModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">Ban User</h2>
              <div className="space-y-4">
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Reason for ban..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                  rows={3}
                />
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="1">1 Minute</option>
                  <option value="60">1 Hour</option>
                  <option value="1440">1 Day</option>
                  <option value="10080">1 Week</option>
                  <option value="infinite">Infinite</option>
                </select>
                <div className="flex gap-3">
                  <button
                    onClick={() => setBanModal({ userId: '', isOpen: false })}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleBanUser(banModal.userId)}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Ban User
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
