import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Search as SearchIcon, User, Users, Bot, ChevronRight, ArrowLeft, Loader2, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

interface Profile {
  uid: string;
  displayName: string;
  photoURL: string;
}

interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  description: string;
  creatorId: string;
  averageRating?: number;
}

export function Search() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'characters' | 'users'>('characters');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userCharacters, setUserCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim() || selectedCategory) {
        handleSearch();
      } else {
        setCharacters([]);
        setProfiles([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, activeTab, selectedCategory]);

  const handleSearch = async () => {
    setIsSearching(true);
    const lowerQuery = searchQuery.toLowerCase();
    try {
      if (activeTab === 'characters') {
        let q = query(
          collection(db, 'characters'),
          where('visibility', '==', 'public'),
          limit(20)
        );
        
        if (searchQuery.trim()) {
          q = query(q, where('name_lowercase', '>=', lowerQuery), where('name_lowercase', '<=', lowerQuery + '\uf8ff'));
        }
        
        if (selectedCategory) {
          q = query(q, where('category', '==', selectedCategory));
        }
        
        const snap = await getDocs(q);
        setCharacters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Character)));
      } else {
        const q = query(
          collection(db, 'profiles'),
          where('displayName_lowercase', '>=', lowerQuery),
          where('displayName_lowercase', '<=', lowerQuery + '\uf8ff'),
          limit(20)
        );
        const snap = await getDocs(q);
        setProfiles(snap.docs.map(doc => doc.data() as Profile));
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserClick = async (profile: Profile) => {
    setSelectedUser(profile);
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'characters'),
        where('creatorId', '==', profile.uid),
        where('visibility', '==', 'public'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setUserCharacters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Character)));
    } catch (error) {
      console.error('Error fetching user characters:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCharacterClick = (charId: string) => {
    if (isGroupMode) {
      setSelectedCharIds(prev => 
        prev.includes(charId) 
          ? prev.filter(id => id !== charId) 
          : [...prev, charId]
      );
    } else {
      navigate(`/chat/${charId}`);
    }
  };

  const startGroupChat = () => {
    if (selectedCharIds.length === 0) return;
    const charIdsParam = selectedCharIds.join(',');
    navigate(`/chat/${selectedCharIds[0]}?chars=${charIdsParam}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-white">Search</h1>
            </div>

            {activeTab === 'characters' && (
              <button
                onClick={() => {
                  setIsGroupMode(!isGroupMode);
                  setSelectedCharIds([]);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  isGroupMode 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Users className="w-4 h-4" />
                {isGroupMode ? 'Cancel Group' : 'Group Chat'}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeTab}...`}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                autoFocus
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                </div>
              )}
            </div>
            {activeTab === 'characters' && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">All</option>
                <option value="test">Test</option>
                <option value="anime">Anime</option>
                <option value="funny">Funny</option>
                <option value="original character">Original Character</option>
                <option value="horror">Horror</option>
              </select>
            )}
          </div>

          <div className="flex gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800 w-fit">
            <button
              onClick={() => {
                setActiveTab('characters');
                setSelectedUser(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'characters' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Bot className="w-4 h-4" />
              Characters
            </button>
            <button
              onClick={() => {
                setActiveTab('users');
                setSelectedUser(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users className="w-4 h-4" />
              Users
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div
                key="user-detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-3">
                    {selectedUser.photoURL ? (
                      <img src={selectedUser.photoURL} alt="" className="w-12 h-12 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <User className="w-6 h-6 text-zinc-500" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedUser.displayName}</h2>
                      <p className="text-zinc-500 text-sm">Public Characters</p>
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  </div>
                ) : userCharacters.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {userCharacters.map((char) => (
                          <button
                            key={char.id}
                            onClick={() => handleCharacterClick(char.id)}
                            className={`flex items-center gap-4 p-4 bg-zinc-900 border rounded-2xl transition-all text-left group relative ${
                              selectedCharIds.includes(char.id) 
                                ? 'border-indigo-500 bg-indigo-500/5' 
                                : 'border-zinc-800 hover:border-indigo-500/50'
                            }`}
                          >
                            {isGroupMode && (
                              <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                selectedCharIds.includes(char.id)
                                  ? 'bg-indigo-600 border-indigo-600'
                                  : 'border-zinc-700'
                              }`}>
                                {selectedCharIds.includes(char.id) && <ChevronRight className="w-3 h-3 text-white rotate-90" />}
                              </div>
                            )}
                            {char.avatarUrl ? (
                              <img src={char.avatarUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700">
                                <Bot className="w-7 h-7 text-zinc-500" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-white font-bold truncate group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                                {char.name}
                                {char.averageRating && (
                                  <span className="flex items-center gap-1 text-xs font-normal text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                    <Star className="w-3 h-3 fill-current" />
                                    {char.averageRating.toFixed(1)}
                                  </span>
                                )}
                              </h3>
                              <p className="text-zinc-500 text-sm line-clamp-2 mt-1">{char.description}</p>
                            </div>
                            {!isGroupMode && <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-indigo-500 transition-colors" />}
                          </button>
                        ))}
                      </div>
                ) : (
                  <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-zinc-800 border-dashed">
                    <Bot className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
                    <p className="text-zinc-500">This user hasn't created any public characters yet.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {activeTab === 'characters' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {characters.length > 0 ? (
                      characters.map((char) => (
                        <button
                          key={char.id}
                          onClick={() => handleCharacterClick(char.id)}
                          className={`flex items-center gap-4 p-4 bg-zinc-900 border rounded-2xl transition-all text-left group relative ${
                            selectedCharIds.includes(char.id) 
                              ? 'border-indigo-500 bg-indigo-500/5' 
                              : 'border-zinc-800 hover:border-indigo-500/50'
                          }`}
                        >
                          {isGroupMode && (
                            <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              selectedCharIds.includes(char.id)
                                ? 'bg-indigo-600 border-indigo-600'
                                : 'border-zinc-700'
                            }`}>
                              {selectedCharIds.includes(char.id) && <ChevronRight className="w-3 h-3 text-white rotate-90" />}
                            </div>
                          )}
                          {char.avatarUrl ? (
                            <img src={char.avatarUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700">
                              <Bot className="w-7 h-7 text-zinc-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-bold truncate group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                              {char.name}
                              {char.averageRating && (
                                <span className="flex items-center gap-1 text-xs font-normal text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                  <Star className="w-3 h-3 fill-current" />
                                  {char.averageRating.toFixed(1)}
                                </span>
                              )}
                            </h3>
                            <p className="text-zinc-500 text-sm line-clamp-2 mt-1">{char.description}</p>
                          </div>
                          {!isGroupMode && <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-indigo-500 transition-colors" />}
                        </button>
                      ))
                    ) : searchQuery.trim() ? (
                      <div className="col-span-full text-center py-12">
                        <p className="text-zinc-500">No characters found matching "{searchQuery}"</p>
                      </div>
                    ) : (
                      <div className="col-span-full text-center py-12">
                        <Bot className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
                        <p className="text-zinc-500">Start typing to search for characters...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {profiles.length > 0 ? (
                      profiles.map((profile) => (
                        <button
                          key={profile.uid}
                          onClick={() => handleUserClick(profile)}
                          className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-indigo-500/50 transition-all text-left group"
                        >
                          {profile.photoURL ? (
                            <img src={profile.photoURL} alt="" className="w-14 h-14 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                              <User className="w-7 h-7 text-zinc-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-bold truncate group-hover:text-indigo-400 transition-colors">{profile.displayName}</h3>
                            <p className="text-zinc-500 text-sm mt-1">View characters</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-indigo-500 transition-colors" />
                        </button>
                      ))
                    ) : searchQuery.trim() ? (
                      <div className="col-span-full text-center py-12">
                        <p className="text-zinc-500">No users found matching "{searchQuery}"</p>
                      </div>
                    ) : (
                      <div className="col-span-full text-center py-12">
                        <Users className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
                        <p className="text-zinc-500">Start typing to search for users...</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
            {isGroupMode && selectedCharIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
              >
                <button
                  onClick={startGroupChat}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold shadow-2xl shadow-indigo-900/40 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Users className="w-6 h-6" />
                  Start Group Chat ({selectedCharIds.length})
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
