import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, dbPrivate, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { doc, getDoc, serverTimestamp, collection, query, where, getDocs, limit, updateDoc, increment, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { User, Save, AlertCircle, Camera, Upload, Trash2, Edit2, Plus, UserCircle, ShieldAlert, Award, MessageSquare, Users, Bot, Star, ChevronRight, Loader2, Layout, Trophy, Zap, TrendingUp } from 'lucide-react';
import { ACHIEVEMENTS, BADGES as LIB_BADGES } from '../lib/gamification';
import { QuotaExceeded } from '../components/QuotaExceeded';
import { BADGES } from '../services/badgeService';
import { LevelProgress } from '../components/LevelProgress';
import { FollowButton } from '../components/FollowButton';
import { playSound } from '../lib/sounds';
import { getCachedData, updateGlobalCache, getCachedProfile, setCachedProfile } from '../lib/cache';
import { Character } from '../types';
import { ImageAdjuster } from '../components/ImageAdjuster';
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

export function Profile() {
  const { t } = useTranslation();
  const { userId: paramUserId } = useParams();
  const navigate = useNavigate();
  const { user, profile: currentUserProfile, updateProfile, isOwner, isModerator } = useAuth();
  const targetUserId = paramUserId || user?.uid;
  const isOwnProfile = !paramUserId || paramUserId === user?.uid;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    photoURL: '',
    bannerURL: '',
    themeColor: '',
    userPersona: '',
    personas: [] as { id: string; name: string; description: string; personality?: string }[],
    badges: [] as string[],
    level: 1,
    xp: 0,
    followersCount: 0,
    followingCount: 0,
    role: 'user',
    email: ''
  });
  const [newPersona, setNewPersona] = useState({ name: '', description: '', personality: '' });
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [userCharacters, setUserCharacters] = useState<Character[]>([]);
  const [loadingChars, setLoadingChars] = useState(false);
  const [adjustingImage, setAdjustingImage] = useState<string | null>(null);
  const [adjustingType, setAdjustingType] = useState<'photo' | 'banner' | null>(null);
  const [earnedAchievements, setEarnedAchievements] = useState<Set<string>>(new Set());
  const [loadingAchievements, setLoadingAchievements] = useState(false);

  const getRankInfo = () => {
    const targetEmail = targetUserId === user?.uid ? user?.email : formData.email;
    const isTargetOwner = targetEmail === 'videosonli5@gmail.com';
    
    if (isTargetOwner) return { label: t('common.owner'), color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    if (formData.role === 'owner' || formData.role === 'admin') return { label: t('common.admin', 'Admin'), color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
    if (formData.role === 'moderator') return { label: t('common.mod'), color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    if (user?.isAnonymous && targetUserId === user.uid) return { label: t('common.guest'), color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };
    return { label: t('common.user'), color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' };
  };

  const handleAddPersona = () => {
    if (!newPersona.name) return;
    setFormData(prev => ({
      ...prev,
      personas: [...prev.personas, { id: Date.now().toString(), ...newPersona }]
    }));
    setNewPersona({ name: '', description: '', personality: '' });
  };

  const handleDeletePersona = (id: string) => {
    setFormData(prev => ({
      ...prev,
      personas: prev.personas.filter(p => p.id !== id)
    }));
  };

  const handleUpdatePersona = (id: string) => {
    setFormData(prev => ({
      ...prev,
      personas: prev.personas.map(p => p.id === id ? { ...p, ...newPersona } : p)
    }));
    setEditingPersonaId(null);
    setNewPersona({ name: '', description: '', personality: '' });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('chat.selectImageError'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(t('common.maxSize'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAdjustingImage(event.target?.result as string);
      setAdjustingType(type);
    };
    reader.readAsDataURL(file);
    // Reset inputs
    if (e.target) e.target.value = '';
  };

  const handleAdjustComplete = (croppedImage: string) => {
    if (adjustingType === 'photo') {
      setFormData(prev => ({ ...prev, photoURL: croppedImage }));
    } else if (adjustingType === 'banner') {
      setFormData(prev => ({ ...prev, bannerURL: croppedImage }));
    }
    setAdjustingImage(null);
    setAdjustingType(null);
  };

  useEffect(() => {
    if (!user || !targetUserId) return;

    const fetchProfile = async () => {
      // Try cache first
      const cached = getCachedProfile(targetUserId);
      if (cached && typeof cached === 'object') {
        const data = cached as any;
          setFormData({
            displayName: data.displayName || '',
            photoURL: data.photoURL || '',
            bannerURL: data.bannerURL || '',
            themeColor: data.themeColor || '',
            userPersona: data.userPersona || '',
            personas: data.personas || [],
            badges: data.badges || [],
            level: data.level || 1,
            xp: data.xp || 0,
            followersCount: data.followersCount || 0,
            followingCount: data.followingCount || 0,
            role: data.role || 'user',
            email: data.email || ''
          });
        setFetching(false);
      }

      try {
        const profileRef = doc(db, 'profiles', targetUserId);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          const profileData = {
            displayName: data.displayName || '',
            photoURL: data.photoURL || '',
            bannerURL: data.bannerURL || '',
            themeColor: data.themeColor || '',
            userPersona: data.userPersona || '',
            personas: data.personas || [],
            badges: data.badges || [],
            level: data.level || 1,
            xp: data.xp || 0,
            followersCount: data.followersCount || 0,
            followingCount: data.followingCount || 0,
            role: data.role || 'user',
            email: data.email || ''
          };
          setFormData(profileData);
          setCachedProfile(targetUserId, profileData);
        }
      } catch (err: any) {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        } else {
          handleFirestoreError(err, OperationType.GET, `profiles/${targetUserId}`);
          setError(t('profile.errorLoad'));
        }
      } finally {
        setFetching(false);
      }
    };

    const fetchUserCharacters = async () => {
      // Try cache first
      const cacheKey = `user_chars_${targetUserId}`;
      const cached = getCachedData(cacheKey);
      if (cached) {
        setUserCharacters(cached as Character[]);
        return;
      }

      setLoadingChars(true);
      try {
        const charRef = collection(db, 'characters');
        const q = query(
          charRef,
          where('creatorId', '==', targetUserId),
          where('visibility', '==', 'public'),
          limit(20)
        );
        
        const snap = await getDocs(q);
        const chars = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Character));
        setUserCharacters(chars);
        updateGlobalCache(cacheKey, chars);
      } catch (err: any) {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        } else {
          console.error('Error fetching characters:', err);
        }
      } finally {
        setLoadingChars(false);
      }
    };

    fetchProfile();
    fetchUserCharacters();

    const fetchAchievements = async () => {
      if (!targetUserId) return;
      
      // Cache-first for own achievements
      if (isOwnProfile) {
        const cached = localStorage.getItem(`achievements_${targetUserId}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Cache valid for 30 mins
            if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
              setEarnedAchievements(new Set(parsed.ids));
              return;
            }
          } catch(e) {
            console.warn("Failed to parse cached achievements");
          }
        }
      }

      setLoadingAchievements(true);
      try {
        const achSnap = await getDocs(collection(db, 'users', targetUserId, 'achievements'));
        const earned = new Set(achSnap.docs.map(doc => doc.id));
        setEarnedAchievements(earned);
        
        if (isOwnProfile) {
          localStorage.setItem(`achievements_${targetUserId}`, JSON.stringify({
            timestamp: Date.now(),
            ids: Array.from(earned)
          }));
        }
      } catch (err) {
        if (isQuotaError(err)) {
          console.warn("Quota exceeded fetching achievements");
        } else {
          console.error('Error fetching achievements:', err);
        }
      } finally {
        setLoadingAchievements(false);
      }
    };

    fetchAchievements();
  }, [user, targetUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isOwnProfile) return;

    setLoading(true);
    setError('');
    setSuccess(false);
    playSound('click');

    try {
      const updatedData = {
        displayName: formData.displayName,
        photoURL: formData.photoURL,
        bannerURL: formData.bannerURL,
        themeColor: formData.themeColor,
        userPersona: formData.userPersona,
        personas: formData.personas
      };
      
      await updateProfile(updatedData);
      setSuccess(true);
      playSound('success');
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      } else {
        setError(t('profile.errorUpdate'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="text-white text-center p-8">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      {quotaExceeded && (
        <div className="bg-amber-600/20 border border-amber-600/30 px-6 py-4 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-amber-500 font-medium">
            <ShieldAlert className="w-6 h-6 flex-shrink-0" />
            <span>{t('common.quotaWarnHome')}</span>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 px-3 py-1 rounded-lg transition-colors border border-amber-600/30"
          >
            {t('common.btnReset')}
          </button>
        </div>
      )}
      
      {/* Profile Header Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Banner */}
        <div className="h-32 bg-zinc-800 relative group/banner">
          {formData.bannerURL ? (
            <img src={formData.bannerURL} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-indigo-600/20 to-purple-600/20" />
          )}
          {isOwnProfile && (
            <>
              <input
                type="file"
                ref={bannerInputRef}
                onChange={(e) => handleImageUpload(e, 'banner')}
                accept="image/*"
                className="hidden"
              />
              <button 
                onClick={() => bannerInputRef.current?.click()}
                className="absolute inset-0 bg-black/0 group-hover/banner:bg-black/40 flex items-center justify-center text-white opacity-0 group-hover/banner:opacity-100 transition-all"
              >
                <Camera className="w-6 h-6" />
              </button>
              <button 
                onClick={() => bannerInputRef.current?.click()}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all backdrop-blur-sm"
              >
                <Camera className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <div className="px-6 pb-6 relative">
          {/* Avatar */}
          <div className="absolute -top-12 left-6">
            <div className="relative w-24 h-24 rounded-full bg-zinc-900 p-1 border-4 border-zinc-950 group/avatar">
              {formData.photoURL ? (
                <img src={formData.photoURL} alt="Avatar" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center">
                  <User className="w-10 h-10 text-zinc-500" />
                </div>
              )}
              {isOwnProfile && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleImageUpload(e, 'photo')}
                    accept="image/*"
                    className="hidden"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover/avatar:opacity-100 transition-all"
                  >
                    <Camera className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="pt-14 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{formData.displayName}</h1>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getRankInfo().color}`}>
                  {getRankInfo().label}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1 text-zinc-400 text-sm">
                  <span className="font-bold text-white">{formData.followersCount}</span>
                  <span>{t('profile.followers')}</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400 text-sm">
                  <span className="font-bold text-white">{formData.followingCount}</span>
                  <span>{t('profile.following')}</span>
                </div>
              </div>
            </div>

              <div className="flex items-center gap-2">
                {!isOwnProfile && (
                  <>
                    <FollowButton targetUserId={targetUserId!} targetUserName={formData.displayName} />
                    {(isOwner || formData.role === 'owner' || formData.role === 'moderator') && (
                      <button 
                        onClick={async () => {
                          if (!user) return;
                          setLoading(true);
                          try {
                            // Check if chat already exists
                            const q = query(
                              collection(dbPrivate, 'private_chats'),
                              where('participants', 'array-contains', user.uid)
                            );
                            const snap = await getDocs(q);
                            let existingChat = snap.docs.find(doc => doc.data().participants.includes(targetUserId));
                            
                            if (existingChat) {
                              navigate('/messages');
                            } else {
                              await addDoc(collection(dbPrivate, 'private_chats'), {
                                type: 'direct',
                                participants: [user.uid, targetUserId],
                                updatedAt: serverTimestamp(),
                                lastMessage: 'Chat started',
                                lastMessageAt: serverTimestamp()
                              });
                              navigate('/messages');
                            }
                          } catch (err) {
                            console.error('Error starting chat:', err);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all"
                        title="Message"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                    )}
                  </>
                )}
              </div>
          </div>

          <div className="mt-6">
            <LevelProgress level={formData.level} xp={formData.xp} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            <div className="p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-2xl text-center">
              <MessageSquare className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
              <div className="text-xl font-bold text-white">{userCharacters.reduce((acc, char) => acc + (char.interactionsCount || 0), 0)}</div>
              <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{t('profile.interactions', 'Interactions')}</div>
            </div>
            <div className="p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-2xl text-center">
              <Star className="w-5 h-5 text-yellow-500 mx-auto mb-2" />
              <div className="text-xl font-bold text-white">
                {userCharacters.length > 0 
                  ? (userCharacters.reduce((acc, char) => acc + (char.averageRating || 0), 0) / userCharacters.length).toFixed(1)
                  : '0.0'}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{t('profile.avgRating', 'Avg Rating')}</div>
            </div>
            <div className="p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-2xl text-center">
              <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-2" />
              <div className="text-xl font-bold text-white">{earnedAchievements.size}</div>
              <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{t('profile.achievements', 'Unlocked')}</div>
            </div>
            <div className="p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-2xl text-center">
              <Zap className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
              <div className="text-xl font-bold text-white">{formData.xp}</div>
              <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total XP</div>
            </div>
          </div>

          {/* Achievements Card */}
          <div className="mt-8 p-6 bg-zinc-950/20 border border-zinc-800/50 rounded-3xl">
             <div className="flex items-center gap-2 mb-4">
                < Award className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t('profile.achievementMilestones', 'Achievement Milestones')}</h3>
             </div>
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.values(ACHIEVEMENTS).map((ach) => (
                  <div 
                    key={ach.id}
                    className={`p-3 rounded-2xl border transition-all ${
                      earnedAchievements.has(ach.id)
                        ? 'bg-amber-500/5 border-amber-500/20 grayscale-0'
                        : 'bg-zinc-900 border-zinc-800 grayscale opacity-40'
                    }`}
                  >
                    <div className="text-2xl mb-2">{ach.icon}</div>
                    <div className="text-xs font-bold text-white truncate">{ach.name}</div>
                    <div className="text-[10px] text-zinc-500 line-clamp-1">{ach.description}</div>
                  </div>
                ))}
             </div>
          </div>

          {formData.badges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {formData.badges.map(badgeId => {
                const badge = BADGES.find(b => b.id === badgeId);
                if (!badge) return null;
                return (
                  <div 
                    key={badgeId} 
                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-xs font-bold"
                    title={badge.description}
                  >
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isOwnProfile && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-900/20">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                   <h3 className="text-xl font-bold">{t('profile.hubTitle')}</h3>
                   <p className="text-white/80 text-sm">{t('profile.hubSub')}</p>
                </div>
                <button
                   onClick={() => navigate('/dashboard')}
                   className="px-6 py-3 bg-white text-indigo-600 rounded-2xl font-bold hover:bg-zinc-100 transition-all flex items-center gap-2 shadow-lg"
                >
                   <Layout className="w-5 h-5" />
                   {t('profile.hubBtn')}
                </button>
              </div>
          </div>
          
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">{t('profile.editTitle')}</h2>
          </div>
          
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">{error}</div>}
          {success && <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl">{t('profile.successUpdate')}</div>}

          <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">{t('profile.displayName')}</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={e => setFormData({...formData, displayName: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">{t('profile.avatarUrl')}</label>
                <input
                  type="text"
                  value={formData.photoURL}
                  onChange={e => setFormData({...formData, photoURL: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">{t('profile.bannerUrl')}</label>
              <input
                type="text"
                value={formData.bannerURL}
                onChange={e => setFormData({...formData, bannerURL: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">{t('profile.userPersona')} ({t('profile.userPersonaDesc')})</label>
              <textarea
                value={formData.userPersona}
                onChange={e => setFormData({...formData, userPersona: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                placeholder={t('profile.userPersonaPlaceholder')}
                rows={4}
              />
            </div>

            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> {loading ? t('profile.btnSaving') : t('profile.btnSave')}
            </button>
          </form>
        </div>
      )}

      {/* Public Characters Section */}
      <div className="mt-12 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-indigo-500" />
            {t('profile.publicCharacters')}
          </h2>
          <span className="text-zinc-500 text-sm font-medium bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
            {userCharacters.length} {t('profile.total')}
          </span>
        </div>

        {loadingChars ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : userCharacters.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {userCharacters.map((char) => (
              <button
                key={char.id}
                onClick={() => navigate(`/chat/${char.id}`)}
                className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-indigo-500/50 transition-all text-left group relative"
              >
                {char.avatarUrl ? (
                  <img src={char.avatarUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <Bot className="w-7 h-7 text-zinc-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold truncate group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                    {char.name}
                    {char.averageRating && (
                      <span className="flex items-center gap-1 text-xs font-normal text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3 fill-current" />
                        {char.averageRating.toFixed(1)}
                      </span>
                    )}
                  </h3>
                  <p className="text-zinc-500 text-sm line-clamp-2 mt-1">{char.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-indigo-500 transition-colors" />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-zinc-800 border-dashed">
            <Bot className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
            <p className="text-zinc-500">{t('profile.noPublicCharacters')}</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {adjustingImage && (
          <ImageAdjuster
            image={adjustingImage}
            onComplete={handleAdjustComplete}
            onCancel={() => {
              setAdjustingImage(null);
              setAdjustingType(null);
            }}
            aspect={adjustingType === 'banner' ? 3 / 1 : 1}
            shape={adjustingType === 'photo' ? 'round' : 'rect'}
            title={adjustingType === 'photo' ? t('profile.adjustAvatar') : t('profile.adjustBanner')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
