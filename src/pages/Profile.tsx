import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { User, Save, AlertCircle, Camera, Upload } from 'lucide-react';

export function Profile() {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    photoURL: '',
    userPersona: '',
    personas: [] as { id: string; name: string; description: string }[]
  });
  const [newPersona, setNewPersona] = useState({ name: '', description: '' });
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  const handleAddPersona = () => {
    if (!newPersona.name) return;
    setFormData(prev => ({
      ...prev,
      personas: [...prev.personas, { id: Date.now().toString(), ...newPersona }]
    }));
    setNewPersona({ name: '', description: '' });
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
    setNewPersona({ name: '', description: '' });
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
            personas: data.personas || []
          });
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.GET, `profiles/${user.uid}`);
        setError('Failed to load profile.');
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
      setError('Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="text-white text-center p-8">Loading...</div>;

  return (
    <div className="max-w-md mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">Edit Profile</h1>

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
          <h2 className="text-xl font-bold text-white">Manage Personas</h2>
          <div className="space-y-3">
            {formData.personas.map(p => (
              <div key={p.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold truncate">{p.name}</h3>
                  <p className="text-zinc-400 text-sm line-clamp-2">{p.description}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingPersonaId(p.id);
                      setNewPersona({ name: p.name, description: p.description });
                    }}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    Edit
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDeletePersona(p.id)} 
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-3">
            <h3 className="text-white font-medium">{editingPersonaId ? 'Edit Persona' : 'Add New Persona'}</h3>
            <input 
              type="text" 
              placeholder="Persona Name (e.g., Adventurer)" 
              value={newPersona.name} 
              onChange={e => setNewPersona({...newPersona, name: e.target.value})} 
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white text-sm" 
            />
            <textarea 
              placeholder="Description (How you want to be perceived)" 
              value={newPersona.description} 
              onChange={e => setNewPersona({...newPersona, description: e.target.value})} 
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white text-sm" 
              rows={3}
            />
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={editingPersonaId ? () => handleUpdatePersona(editingPersonaId) : handleAddPersona} 
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editingPersonaId ? 'Update' : 'Add'}
              </button>
              {editingPersonaId && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditingPersonaId(null);
                    setNewPersona({ name: '', description: '' });
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
          <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
