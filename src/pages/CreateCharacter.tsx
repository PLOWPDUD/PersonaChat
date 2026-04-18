import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, getDoc, addDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Image as ImageIcon, Sparkles, AlertCircle, Upload, X, Edit3 } from 'lucide-react';
import { getLocalCharacterById, saveLocalCharacter, deleteLocalCharacter, LocalCharacter } from '../lib/localStorage';
import { ImageAdjuster } from '../components/ImageAdjuster';
import { AnimatePresence } from 'motion/react';

export function CreateCharacter() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { characterId } = useParams<{ characterId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [adjustingImage, setAdjustingImage] = useState<string | null>(null);
  const [agreedToRules, setAgreedToRules] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    avatarUrl: '',
    greeting: '',
    description: '',
    personality: '',
    visibility: 'public' as 'public' | 'private' | 'unlisted',
    category: ''
  });

  useEffect(() => {
    if (!characterId || !user) return;

    const fetchCharacter = async () => {
      setFetching(true);
      try {
        // Check local storage first
        const localChar = getLocalCharacterById(characterId);
        if (localChar) {
          setFormData({
            name: localChar.name || '',
            avatarUrl: localChar.avatarUrl || '',
            greeting: localChar.greeting || '',
            description: localChar.description || '',
            personality: localChar.personality || '',
            visibility: 'private',
            category: localChar.category || ''
          });
          if (localChar.avatarUrl) {
            setImagePreview(localChar.avatarUrl);
          }
          setFetching(false);
          return;
        }

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
            visibility: data.visibility || 'public',
            category: data.category || ''
          });
          
          if (data.avatarUrl) {
            setImagePreview(data.avatarUrl);
          }
        } else {
          setError('Character not found.');
        }
      } catch (err: any) {
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
      setAdjustingImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    // Reset input
    if (e.target) e.target.value = '';
  };

  const handleAdjustComplete = (croppedImage: string) => {
    setImagePreview(croppedImage);
    setFormData(prev => ({ ...prev, avatarUrl: croppedImage }));
    setAdjustingImage(null);
  };

  const removeImage = () => {
    setImagePreview(null);
    setFormData(prev => ({ ...prev, avatarUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!agreedToRules) {
      setError('You must agree to the community rules before creating a character.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const creatorName = profile?.displayName || user.displayName || 'Anonymous User';
      
      const saveLocal = () => {
        const id = characterId || `local_${Date.now()}`;
        const existingLocal = characterId?.startsWith('local_') ? getLocalCharacterById(characterId) : null;
        
        const localChar: LocalCharacter = {
          ...formData,
          id,
          creatorId: user.uid,
          creatorName,
          createdAt: existingLocal?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          likesCount: existingLocal?.likesCount || 0,
          interactionsCount: existingLocal?.interactionsCount || 0,
          name_lowercase: formData.name.toLowerCase(),
          visibility: formData.visibility
        };
        
        saveLocalCharacter(localChar);
        return id;
      };

      try {
        if (characterId && !characterId.startsWith('local_')) {
          // Update existing Firestore character
          const charRef = doc(db, 'characters', characterId);
          await updateDoc(charRef, {
            ...formData,
            creatorName,
            name_lowercase: formData.name.toLowerCase(),
            updatedAt: serverTimestamp()
          });
          
          if (formData.visibility === 'private') {
            saveLocal();
          }

          // Clear caches
          localStorage.removeItem('cached_public_characters');
          localStorage.removeItem('last_public_fetch');
          
          navigate(`/chat/${characterId}`);
        } else {
          // Create new Firestore character
          const charData = {
            ...formData,
            creatorId: user.uid,
            creatorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            likesCount: 0,
            interactionsCount: 0,
            name_lowercase: formData.name.toLowerCase()
          };

          const docRef = await addDoc(collection(db, 'characters'), charData);
          
          // If owner creates a public character, notify everyone
          if (user.email === 'videosonli5@gmail.com' && formData.visibility === 'public') {
            try {
              await addDoc(collection(db, 'global_notifications'), {
                type: 'new_character',
                title: 'New Character from Owner!',
                message: `${creatorName} has just released a new character: ${formData.name}`,
                characterId: docRef.id,
                createdAt: serverTimestamp()
              });
            } catch (e) {
              console.error("Failed to create global notification:", e);
            }
          }
          
          // Always save locally for private characters too
          if (formData.visibility === 'private') {
            saveLocal();
          }

          // If it was a local character being made public, delete the old local one
          if (characterId?.startsWith('local_')) {
            deleteLocalCharacter(characterId);
          }
          
          // Clear caches
          localStorage.removeItem('cached_public_characters');
          localStorage.removeItem('last_public_fetch');
          
          navigate(`/chat/${docRef.id}`);
        }
      } catch (fbErr: any) {
        console.warn("Firestore save failed, falling back to local storage:", fbErr);
        const localId = saveLocal();
        navigate(`/chat/${localId}`);
      }
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, characterId ? OperationType.UPDATE : OperationType.CREATE, characterId ? `characters/${characterId}` : 'characters');
      setError(err.message || `Failed to ${characterId ? 'update' : 'create'} character`);
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
            <label htmlFor="category" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Category
            </label>
            <select
              id="category"
              name="category"
              value={formData.category || ''}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            >
              <option value="">Categoryless</option>
              <option value="test">Test</option>
              <option value="anime">Anime</option>
              <option value="funny">Funny</option>
              <option value="original character">Original Character</option>
              <option value="horror">Horror</option>
              <option value="fantasy">Fantasy</option>
              <option value="sci-fi">Sci-Fi</option>
              <option value="action">Action</option>
              <option value="romance">Romance</option>
              <option value="mystery">Mystery</option>
            </select>
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
              <option value="unlisted">Unlisted - Accessible via link</option>
            </select>
          </div>

          <div className="pt-4">
            <label className="flex items-start gap-3 p-4 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={agreedToRules}
                onChange={(e) => setAgreedToRules(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-zinc-800 text-indigo-600 focus:ring-indigo-500 bg-zinc-900"
              />
              <span className="text-sm text-zinc-300 leading-tight">
                I have read and agree to follow the <Link to="/rules" target="_blank" className="text-indigo-400 hover:underline font-bold">Community Rules</Link> when creating this character. I understand that public characters violating these rules will be removed.
              </span>
            </label>
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

      <AnimatePresence>
        {adjustingImage && (
          <ImageAdjuster
            image={adjustingImage}
            onComplete={handleAdjustComplete}
            onCancel={() => setAdjustingImage(null)}
            aspect={1}
            shape="rect"
            title="Adjust Character Avatar"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
