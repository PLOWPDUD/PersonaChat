import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { UserCircle, Trash2, Plus, AlertCircle, Edit2, Save, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Persona {
  id: string;
  name: string;
  description: string;
  personality?: string;
}

export function Personas() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newPersona, setNewPersona] = useState({ name: '', description: '', personality: '' });
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const personas = profile?.personas || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const personaId = crypto.randomUUID();
      const personaData = {
        id: personaId,
        ...newPersona,
        createdAt: new Date().toISOString()
      };

      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, {
        personas: arrayUnion(personaData)
      });
      
      setNewPersona({ name: '', description: '', personality: '' });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${user.uid}`);
      setError('Failed to create persona.');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingPersona || !profile) return;

    setIsUpdating(true);
    try {
      const updatedPersonas = (profile.personas || []).map((p: Persona) => 
        p.id === editingPersona.id ? editingPersona : p
      );

      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, {
        personas: updatedPersonas
      });
      
      setEditingPersona(null);
      setError('');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${user.uid}`);
      setError('Failed to update persona.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (persona: any) => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, {
        personas: arrayRemove(persona)
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${user.uid}`);
      setError('Failed to delete persona.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">My Personas</h1>
      
      <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white">Create New Persona</h2>
        <input
          type="text"
          placeholder="Name"
          value={newPersona.name}
          onChange={e => setNewPersona({...newPersona, name: e.target.value})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
          required
        />
        <textarea
          placeholder="Description"
          value={newPersona.description}
          onChange={e => setNewPersona({...newPersona, description: e.target.value})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
          required
        />
        <textarea
          placeholder="Personality (Optional)"
          value={newPersona.personality}
          onChange={e => setNewPersona({...newPersona, personality: e.target.value})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
        />
        <button type="submit" className="bg-indigo-600 text-white py-2 px-4 rounded-xl flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Persona
        </button>
      </form>

      {error && <div className="text-red-400">{error}</div>}

      <div className="grid gap-4">
        {personas.map(p => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <UserCircle className="w-10 h-10 text-indigo-500" />
              <div>
                <h3 className="text-white font-semibold">{p.name}</h3>
                <p className="text-zinc-400 text-sm">{p.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setEditingPersona(p)}
                className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => handleDelete(p)} 
                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingPersona && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative"
            >
              <button 
                onClick={() => setEditingPersona(null)}
                className="absolute right-4 top-4 p-2 text-zinc-500 hover:text-white rounded-xl"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-6">Edit Persona</h2>
              
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">Name</label>
                  <input
                    type="text"
                    value={editingPersona.name}
                    onChange={e => setEditingPersona({...editingPersona, name: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-600 transition-all"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">Description</label>
                  <textarea
                    value={editingPersona.description}
                    onChange={e => setEditingPersona({...editingPersona, description: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-600 transition-all"
                    rows={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">Personality Traits</label>
                  <textarea
                    value={editingPersona.personality || ''}
                    onChange={e => setEditingPersona({...editingPersona, personality: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-600 transition-all"
                    rows={4}
                    placeholder="E.g. Witty, sarcastic, highly intelligent, loves coffee..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingPersona(null)}
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isUpdating}
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
