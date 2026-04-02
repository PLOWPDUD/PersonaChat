import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserCircle, Trash2, Plus, AlertCircle } from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  description: string;
  personality?: string;
}

export function Personas() {
  const { user } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newPersona, setNewPersona] = useState({ name: '', description: '', personality: '' });

  useEffect(() => {
    if (!user) return;

    const fetchPersonas = async () => {
      setLoading(true);
      try {
        const personasRef = collection(db, 'personas');
        const q = query(personasRef, where('creatorId', '==', user.uid));
        const snapshot = await getDocs(q);
        const p: Persona[] = [];
        snapshot.forEach((doc) => {
          p.push({ id: doc.id, ...doc.data() } as Persona);
        });
        setPersonas(p);
      } catch (err: any) {
        handleFirestoreError(err, OperationType.LIST, 'personas');
        setError('Failed to load personas.');
      } finally {
        setLoading(false);
      }
    };

    fetchPersonas();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const docRef = await addDoc(collection(db, 'personas'), {
        ...newPersona,
        creatorId: user.uid,
        createdAt: serverTimestamp()
      });
      setPersonas([...personas, { id: docRef.id, ...newPersona }]);
      setNewPersona({ name: '', description: '', personality: '' });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'personas');
      setError('Failed to create persona.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'personas', id));
      setPersonas(personas.filter(p => p.id !== id));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `personas/${id}`);
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
            <button onClick={() => handleDelete(p.id)} className="text-zinc-500 hover:text-red-400">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
