import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Image as ImageIcon, Sparkles, AlertCircle, Upload, X, Edit3 } from 'lucide-react';

export function CreateCharacter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { characterId } = useParams<{ characterId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    avatarUrl: '',
    greeting: '',
    description: '',
    personality: '',
    visibility: 'public' as 'public' | 'private'
  });

  useEffect(() => {
    if (!characterId || !user) return;

    const fetchCharacter = async () => {
      setFetching(true);
      try {
        const charRef = doc(db, 'characters', characterId);
        const charSnap = await getDoc(charRef);
        
        if (charSnap.exists()) {
          const data = charSnap.data();
          // Security check: only creator can edit
          if (data.creatorId !== user.uid) {
            setError('You do not have permission to edit this character.');
            return;
          }
          
          setFormData({
            name: data.name || '',
            avatarUrl: data.avatarUrl || '',
            greeting: data.greeting || '',
            description: data.description || '',
            personality: data.personality || '',
            visibility: data.visibility || 'public'
          });
          
          if (data.avatarUrl) {
            setImagePreview(data.avatarUrl);
          }
        } else {
          setError('Character not found.');
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.GET, `characters/${characterId}`);
        setError('Failed to load character data.');
      } finally {
        setFetching(false);
      }
    };

    fetchCharacter();
  }, [characterId, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    // Limit to 2MB for initial selection, we will resize it anyway
    if (file.size > 2 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize image using canvas
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

        // Convert to low-quality JPEG to save space
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImagePreview(dataUrl);
        setFormData(prev => ({ ...prev, avatarUrl: dataUrl }));
        setError('');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, avatarUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      const name_lowercase = formData.name.toLowerCase();
      if (characterId) {
        // Update existing character
        const charRef = doc(db, 'characters', characterId);
        await updateDoc(charRef, {
          ...formData,
          name_lowercase,
          updatedAt: serverTimestamp()
        });
        navigate(`/chat/${characterId}`);
      } else {
        // Create new character
        const charData = {
          ...formData,
          name_lowercase,
          creatorId: user.uid,
          createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'characters'), charData);
        navigate(`/chat/${docRef.id}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || `Failed to ${characterId ? 'update' : 'create'} character`);
      handleFirestoreError(err, characterId ? OperationType.UPDATE : OperationType.CREATE, 'characters');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          {characterId ? (
            <Edit3 className="w-8 h-8 text-indigo-500" />
          ) : (
            <UserPlus className="w-8 h-8 text-indigo-500" />
          )}
          {characterId ? 'Edit Character' : 'Create Character'}
        </h1>
        <p className="text-zinc-400 mt-2">
          {characterId ? 'Update your character\'s details.' : 'Design a new AI personality to chat with.'}
        </p>
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
            <label className="block text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Avatar
            </label>
            
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-2xl bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 group overflow-hidden relative"
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload className="w-5 h-5 text-white" />
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" />
                    <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 font-medium">Upload</span>
                  </>
                )}
              </div>

              <div className="flex-1 w-full space-y-3">
                <div className="relative">
                  <input
                    type="url"
                    id="avatarUrl"
                    name="avatarUrl"
                    maxLength={1000}
                    value={formData.avatarUrl.startsWith('data:') ? '' : formData.avatarUrl}
                    onChange={handleChange}
                    placeholder="Or paste an image URL..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                  />
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Recommended: Square image, max 2MB. URL will be ignored if you upload a file.
                </p>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
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
            {loading ? (characterId ? 'Updating...' : 'Creating...') : (characterId ? 'Update Character' : 'Create Character')}
          </button>
        </div>
      </form>
    </div>
  );
}
