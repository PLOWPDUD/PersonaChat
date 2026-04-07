import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { UserCircle, Trash2, Plus, AlertCircle } from 'lucide-react';

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
            <button onClick={() => handleDelete(p)} className="text-zinc-500 hover:text-red-400">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
