import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { doc, getDoc, serverTimestamp, collection, query, where, getDocs, limit, updateDoc, increment, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { User, Save, AlertCircle, Camera, Upload, Trash2, Edit2, Plus, UserCircle, ShieldAlert, Award, MessageSquare, Users } from 'lucide-react';
import { QuotaExceeded } from '../components/QuotaExceeded';
import { BADGES } from '../services/badgeService';
import { LevelProgress } from '../components/LevelProgress';
import { FollowButton } from '../components/FollowButton';
import { playSound } from '../lib/sounds';

export function Profile() {
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
    role: 'user'
  });
  const [newPersona, setNewPersona] = useState({ name: '', description: '', personality: '' });
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  const getRankInfo = () => {
    if (isOwner) return { label: 'Owner', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    if (isModerator) return { label: 'Mod', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
    if (user?.isAnonymous) return { label: 'Guest', color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };
    return { label: 'User', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' };
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
      setError('Please select an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = type === 'photo' ? 400 : 1200;
        const MAX_HEIGHT = type === 'photo' ? 400 : 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        if (type === 'photo') {
          setFormData(prev => ({ ...prev, photoURL: dataUrl }));
        } else {
          setFormData(prev => ({ ...prev, bannerURL: dataUrl }));
        }
        setError('');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      if (!targetUserId) return;
      try {
        const profileRef = doc(db, 'profiles', targetUserId);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const data = profileSnap.data();
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
            role: data.role || 'user'
          });
        }
      } catch (err: any) {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        } else {
          handleFirestoreError(err, OperationType.GET, `profiles/${targetUserId}`);
          setError('Failed to load profile.');
        }
      } finally {
        setFetching(false);
      }
    };

    fetchProfile();
  }, [user]);

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
        setError('Failed to update profile.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="text-white text-center p-8">Loading...</div>;

  if (quotaExceeded) {
    return (
      <div className="max-w-2xl mx-auto p-12 bg-zinc-900 border border-zinc-800 rounded-3xl text-center">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Quota Limit Reached</h2>
        <p className="text-zinc-400 mb-6">
          The website has reached its daily data limit for the free tier. 
          Profile updates are temporarily unavailable. Please check back tomorrow!
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

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
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
                  <span>Followers</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-400 text-sm">
                  <span className="font-bold text-white">{formData.followingCount}</span>
                  <span>Following</span>
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
                              collection(db, 'private_chats'),
                              where('participants', 'array-contains', user.uid)
                            );
                            const snap = await getDocs(q);
                            let existingChat = snap.docs.find(doc => doc.data().participants.includes(targetUserId));
                            
                            if (existingChat) {
                              navigate('/messages');
                            } else {
                              await addDoc(collection(db, 'private_chats'), {
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
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
          </div>
          
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">{error}</div>}
          {success && <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl">Profile updated successfully!</div>}

          <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Display Name</label>
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
                <label className="block text-sm font-medium text-zinc-300 mb-1">Avatar URL</label>
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
              <label className="block text-sm font-medium text-zinc-300 mb-1">Banner URL</label>
              <input
                type="text"
                value={formData.bannerURL}
                onChange={e => setFormData({...formData, bannerURL: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Your Persona (Describe yourself for the bots)</label>
              <textarea
                value={formData.userPersona}
                onChange={e => setFormData({...formData, userPersona: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                placeholder="I am a..."
                rows={4}
              />
            </div>

            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
