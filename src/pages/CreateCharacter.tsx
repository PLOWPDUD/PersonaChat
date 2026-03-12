import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Image as ImageIcon, Sparkles, AlertCircle } from 'lucide-react';

export function CreateCharacter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    avatarUrl: '',
    greeting: '',
    description: '',
    personality: '',
    visibility: 'public' as 'public' | 'private'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      const charData = {
        ...formData,
        creatorId: user.uid,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'characters'), charData);
      navigate(`/chat/${docRef.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create character');
      handleFirestoreError(err, OperationType.CREATE, 'characters');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <UserPlus className="w-8 h-8 text-indigo-500" />
          Create Character
        </h1>
        <p className="text-zinc-400 mt-2">Design a new AI personality to chat with.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8">
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Character Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              maxLength={100}
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Albert Einstein, Fantasy Guide, etc."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>

          <div>
            <label htmlFor="avatarUrl" className="block text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Avatar URL (Optional)
            </label>
            <input
              type="url"
              id="avatarUrl"
              name="avatarUrl"
              maxLength={1000}
              value={formData.avatarUrl}
              onChange={handleChange}
              placeholder="https://example.com/image.jpg"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>

          <div>
            <label htmlFor="greeting" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Greeting <span className="text-red-400">*</span>
            </label>
            <textarea
              id="greeting"
              name="greeting"
              required
              maxLength={1000}
              rows={3}
              value={formData.greeting}
              onChange={handleChange}
              placeholder="What would they say to start a conversation?"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow resize-none"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Description & Persona <span className="text-red-400">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              required
              maxLength={5000}
              rows={5}
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe who they are, their background, how they speak, their relationships, etc. The AI will use this to roleplay."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow resize-y"
            />
          </div>

          <div>
            <label htmlFor="personality" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Personality Traits (Optional)
            </label>
            <input
              type="text"
              id="personality"
              name="personality"
              maxLength={2000}
              value={formData.personality}
              onChange={handleChange}
              placeholder="e.g. Sarcastic, helpful, mysterious, cheerful"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>

          <div>
            <label htmlFor="visibility" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Visibility
            </label>
            <select
              id="visibility"
              name="visibility"
              value={formData.visibility}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow appearance-none"
            >
              <option value="public">Public - Anyone can chat</option>
              <option value="private">Private - Only you can chat</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? 'Creating...' : 'Create Character'}
          </button>
        </div>
      </form>
    </div>
  );
}
