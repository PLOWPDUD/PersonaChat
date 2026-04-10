import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { User, Save, AlertCircle, Camera, Upload, Trash2, Edit2, Plus, UserCircle, ShieldAlert, Award } from 'lucide-react';
import { QuotaExceeded } from '../components/QuotaExceeded';
import { BADGES } from '../services/badgeService';

export function Profile() {
  const { user, updateProfile, isOwner, isModerator } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    photoURL: '',
    userPersona: '',
    personas: [] as { id: string; name: string; description: string; personality?: string }[],
    badges: [] as string[]
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
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
        setFormData(prev => ({ ...prev, photoURL: dataUrl }));
        setError('');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        const profileRef = doc(db, 'profiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setFormData({
            displayName: data.displayName || '',
            photoURL: data.photoURL || '',
            userPersona: data.userPersona || '',
            personas: data.personas || [],
            badges: data.badges || []
          });
        }
      } catch (err: any) {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        } else {
          handleFirestoreError(err, OperationType.GET, `profiles/${user.uid}`);
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
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const updatedData = {
        displayName: formData.displayName,
        photoURL: formData.photoURL,
        userPersona: formData.userPersona,
        personas: formData.personas
      };
      
      await updateProfile(updatedData);
      setSuccess(true);
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
    <div className="max-w-md mx-auto space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Edit Profile</h1>
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${getRankInfo().color}`}>
            {getRankInfo().label}
          </span>
        </div>
        
        {formData.badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
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

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">{error}</div>}
      {success && <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl">Profile updated successfully!</div>}

      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex justify-center">
          <div className="relative w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden group">
            {formData.photoURL ? (
              <img src={formData.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-zinc-500" />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />

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
          <label className="block text-sm font-medium text-zinc-300 mb-1">Avatar URL (or upload above)</label>
          <input
            type="text"
            value={formData.photoURL}
            onChange={e => setFormData({...formData, photoURL: e.target.value})}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
            placeholder="https://... or data:image/..."
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

        <div className="space-y-4 pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UserCircle className="w-6 h-6 text-indigo-500" />
              Custom Personas
            </h2>
          </div>
          
          <p className="text-sm text-zinc-400">
            Create different personas for yourself to use in chats. These help the AI understand who you are in different contexts.
          </p>

          <div className="space-y-3">
            {formData.personas.map(p => (
              <div key={p.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl group hover:border-indigo-500/30 transition-all">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate">{p.name}</h3>
                    <p className="text-zinc-400 text-sm line-clamp-2 mt-1">{p.description}</p>
                    {p.personality && (
                      <p className="text-zinc-500 text-xs mt-2 italic line-clamp-1">
                        Personality: {p.personality}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingPersonaId(p.id);
                        setNewPersona({ 
                          name: p.name, 
                          description: p.description,
                          personality: p.personality || ''
                        });
                        // Scroll to form
                        const form = document.getElementById('persona-form');
                        form?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="p-2 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                      title="Edit Persona"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDeletePersona(p.id)} 
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Delete Persona"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div id="persona-form" className="bg-zinc-950 border border-zinc-800 p-5 rounded-2xl space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2">
                {editingPersonaId ? <Edit2 className="w-4 h-4 text-indigo-500" /> : <Plus className="w-4 h-4 text-indigo-500" />}
                {editingPersonaId ? 'Edit Persona' : 'Add New Persona'}
              </h3>
              {editingPersonaId && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditingPersonaId(null);
                    setNewPersona({ name: '', description: '', personality: '' });
                  }}
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 ml-1">Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Brave Explorer" 
                  value={newPersona.name} 
                  onChange={e => setNewPersona({...newPersona, name: e.target.value})} 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all" 
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 ml-1">Description</label>
                <textarea 
                  placeholder="Briefly describe this persona..." 
                  value={newPersona.description} 
                  onChange={e => setNewPersona({...newPersona, description: e.target.value})} 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all resize-none" 
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 ml-1">Personality Traits (Optional)</label>
                <textarea 
                  placeholder="e.g. Sarcastic, helpful, adventurous..." 
                  value={newPersona.personality} 
                  onChange={e => setNewPersona({...newPersona, personality: e.target.value})} 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all resize-none" 
                  rows={2}
                />
              </div>
            </div>

            <button 
              type="button"
              onClick={editingPersonaId ? () => handleUpdatePersona(editingPersonaId) : handleAddPersona} 
              disabled={!newPersona.name || !newPersona.description}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/10"
            >
              {editingPersonaId ? 'Update Persona' : 'Add Persona'}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
          <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
