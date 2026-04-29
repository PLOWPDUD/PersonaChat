import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { UserCircle, Trash2, Plus, AlertCircle, Edit2, Save, X, Loader2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface Persona {
  id: string;
  name: string;
  description: string;
  personality?: string;
}

export function Personas() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importModal, setImportModal] = useState<{ isOpen: boolean; data: any }>({ isOpen: false, data: null });
  const importInputRef = React.useRef<HTMLInputElement>(null);
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
      setError(t('personas.errorCreate'));
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
      setError(t('personas.errorUpdate'));
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
      setError(t('personas.errorDelete'));
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        // Handle various common export formats for personas
        // C.AI usually has a "user_persona" object or similar
        let personaData = data.user_persona || data.persona || data;
        
        // If it's a character file instead of persona file, try to extract useful info
        const normalized = {
          name: personaData.name || data.char_name || personaData.title || 'Imported Persona',
          description: personaData.description || personaData.definition || data.char_persona || '',
          personality: personaData.personality || ''
        };

        if (!normalized.description && !normalized.personality) {
          setError('Could not find persona details in this file.');
          return;
        }

        setImportModal({ isOpen: true, data: normalized });
      } catch (err) {
        setError('Failed to parse file. Make sure it is a valid JSON.');
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const confirmImport = async () => {
    if (!user || !importModal.data) return;
    setLoading(true);
    try {
      const personaId = crypto.randomUUID();
      const personaData = {
        id: personaId,
        ...importModal.data,
        createdAt: new Date().toISOString()
      };

      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, {
        personas: arrayUnion(personaData)
      });
      
      setImportModal({ isOpen: false, data: null });
      setError('');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${user.uid}`);
      setError(t('personas.errorCreate'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white">{t('personas.title')}</h1>
        <button
          onClick={handleImportClick}
          className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all border border-zinc-700 shadow-xl"
        >
          <Download className="w-5 h-5 text-indigo-400" />
          Import from C.AI
        </button>
      </div>

      <input
        type="file"
        ref={importInputRef}
        onChange={handleFileImport}
        accept=".json"
        className="hidden"
      />
      
      <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white">{t('personas.createTitle')}</h2>
        <input
          type="text"
          placeholder={t('personas.name')}
          value={newPersona.name}
          onChange={e => setNewPersona({...newPersona, name: e.target.value})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
          required
        />
        <textarea
          placeholder={t('personas.description')}
          value={newPersona.description}
          onChange={e => setNewPersona({...newPersona, description: e.target.value})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
          required
        />
        <textarea
          placeholder={`${t('personas.personality')} (${t('common.optional')})`}
          value={newPersona.personality}
          onChange={e => setNewPersona({...newPersona, personality: e.target.value})}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
        />
        <button type="submit" className="bg-indigo-600 text-white py-2 px-4 rounded-xl flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('personas.btnCreate')}
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

              <h2 className="text-2xl font-bold text-white mb-6">{t('personas.editTitle')}</h2>
              
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">{t('personas.name')}</label>
                  <input
                    type="text"
                    value={editingPersona.name}
                    onChange={e => setEditingPersona({...editingPersona, name: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-600 transition-all"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">{t('personas.description')}</label>
                  <textarea
                    value={editingPersona.description}
                    onChange={e => setEditingPersona({...editingPersona, description: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-600 transition-all"
                    rows={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">{t('personas.personality')}</label>
                  <textarea
                    value={editingPersona.personality || ''}
                    onChange={e => setEditingPersona({...editingPersona, personality: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-600 transition-all"
                    rows={4}
                    placeholder={t('personas.personalityPlaceholder')}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingPersona(null)}
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                  <button 
                    type="submit" 
                    disabled={isUpdating}
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {t('personas.saveChanges')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {importModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative"
            >
              <h2 className="text-2xl font-bold text-white mb-4">Import Persona</h2>
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-6 space-y-2">
                <p className="text-white font-bold">{importModal.data?.name}</p>
                <p className="text-zinc-400 text-sm line-clamp-4">{importModal.data?.description}</p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setImportModal({ isOpen: false, data: null })}
                  className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmImport}
                  disabled={loading}
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Confirm Import
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
