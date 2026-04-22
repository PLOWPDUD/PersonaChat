import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp, limit, deleteDoc, updateDoc, startAfter } from 'firebase/firestore';
import { db, dbChat, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { addNotification } from '../lib/gamification';
import { getCachedProfile, setCachedProfiles, getCachedFavorites, setCachedFavorites, getCachedData, updateGlobalCache } from '../lib/cache';
import { getLocalCharacters } from '../lib/localStorage';
import { MessageCircle, User, Globe, Lock, Bot, Edit2, Star, Users, Plus, X, Check, Search, Loader2, Trash2, Heart, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QuotaExceeded } from '../components/QuotaExceeded';
import { Character, Chat } from '../types';
import { useTranslation } from 'react-i18next';

export function Home() {
  const { t } = useTranslation();
  const { user, profile, quotaExceeded: globalQuotaExceeded } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'public' | 'mine' | 'recent'>('public');
  const [cachedData, setCachedData] = useState<{
    public: Character[];
    mine: Character[];
    recent: any[];
  }>({ public: [], mine: [], recent: [] });
  const [isGroupChatModalOpen, setIsGroupChatModalOpen] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<Character[]>([]);
  const [recentCharacters, setRecentCharacters] = useState<Character[]>([]);
  const [cachedRecentCharacters, setCachedRecentCharacters] = useState<Character[]>([]);
  const [isFetchingRecent, setIsFetchingRecent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Character[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [localQuotaExceeded, setLocalQuotaExceeded] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Report Modal States
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportTargetName, setReportTargetName] = useState<string | null>(null);
  const [reportTargetCreatorId, setReportTargetCreatorId] = useState<string | null>(null);

  const quotaExceeded = globalQuotaExceeded || localQuotaExceeded;

  const handleReport = async () => {
    if (!user || !reportTargetId || !reportReason.trim()) return;
    setIsSubmittingReport(true);
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        targetId: reportTargetId,
        targetName: reportTargetName,
        creatorId: reportTargetCreatorId,
        type: 'character',
        reason: reportReason.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsReportModalOpen(false);
      setReportReason('');
      setReportTargetId(null);
      setReportTargetName(null);
      setReportTargetCreatorId(null);
      alert(t('community.reportSuccess'));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const openReportModal = (e: React.MouseEvent, char: Character) => {
    e.preventDefault();
    e.stopPropagation();
    setReportTargetId(char.id);
    setReportTargetName(char.name);
    setReportTargetCreatorId(char.creatorId);
    setIsReportModalOpen(true);
  };

  const toggleFavorite = async (e: React.MouseEvent, charId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    const isFavorite = favorites.has(charId);
    const newFavorites = new Set(favorites);
    
    if (isFavorite) {
      newFavorites.delete(charId);
      setFavorites(newFavorites);
      try {
        const q = query(collection(db, 'favorites'), where('userId', '==', user.uid), where('characterId', '==', charId));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => deleteDoc(doc.ref));
        await updateDoc(doc(db, 'characters', charId), {
          likesCount: Math.max(0, (characters.find(c => c.id === charId)?.likesCount || 0) - 1)
        });
      } catch (error) {
        console.error('Error removing favorite:', error);
        setFavorites(favorites); // Revert
      }
    } else {
      newFavorites.add(charId);
      setFavorites(newFavorites);
      try {
        await addDoc(collection(db, 'favorites'), {
          userId: user.uid,
          characterId: charId,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'characters', charId), {
          likesCount: (characters.find(c => c.id === charId)?.likesCount || 0) + 1
        });

        // Notify creator
        const char = characters.find(c => c.id === charId);
        if (char && char.creatorId !== user.uid) {
          await addNotification(char.creatorId, 'character_favorited', 'Character Favorited!', `${profile?.displayName || 'Someone'} favorited your character ${char.name}.`, { characterId: charId });
        }
      } catch (error) {
        console.error('Error adding favorite:', error);
        setFavorites(favorites); // Revert
      }
    }
  };

  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;
    setIsDeletingChat(chatToDelete);
    try {
      await deleteDoc(doc(dbChat, 'chats', chatToDelete));
      setRecentChats(prev => prev.filter(c => c.id !== chatToDelete));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatToDelete}`);
    } finally {
      setIsDeletingChat(null);
      setChatToDelete(null);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setChatToDelete(chatId);
  };

  useEffect(() => {
    if (!user) return;

    const fetchFavorites = async () => {
      // Check cache first
      const cachedFavs = getCachedFavorites();
      if (cachedFavs) {
        setFavorites(cachedFavs);
        return;
      }

      try {
        const favsRef = collection(db, 'favorites');
        const favsQ = query(favsRef, where('userId', '==', user.uid));
        const favsSnapshot = await getDocs(favsQ);
        const favIds = new Set<string>();
        favsSnapshot.forEach(doc => favIds.add(doc.data().characterId));
        setFavorites(favIds);
        setCachedFavorites(favIds);
      } catch (error: any) {
        if (isQuotaError(error)) {
          setLocalQuotaExceeded(true);
        } else {
          console.error('Error fetching favorites:', error);
        }
      }
    };

    fetchFavorites();
  }, [user]);

  const fetchData = async (isLoadMore = false) => {
    if (!user) return;
    if (isLoadMore) setIsFetchingMore(true);
    else {
      // Check global cache first
      const globalCached = getCachedData(tab);
      if (globalCached && globalCached.length > 0 && !isLoadMore) {
        if (tab === 'recent') setRecentChats(globalCached);
        else setCharacters(globalCached);
        setLoading(false);
        return;
      }

      // Check localStorage for 'public' tab (10 min cache)
      if (tab === 'public' && !isLoadMore) {
        const cached = localStorage.getItem('cached_public_characters');
        const lastFetch = localStorage.getItem('last_public_fetch');
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;

        if (cached && lastFetch && (now - parseInt(lastFetch)) < tenMinutes) {
          const parsed = JSON.parse(cached);
          setCharacters(parsed);
          setLoading(false);
          return;
        }
      }

      // Check local component cache
      if (tab === 'recent' && cachedData.recent.length > 0) {
        setRecentChats(cachedData.recent);
        setLoading(false);
        return;
      }
      if (tab === 'public' && cachedData.public.length > 0) {
        setCharacters(cachedData.public);
        setLoading(false);
        return;
      }
      if (tab === 'mine' && cachedData.mine.length > 0) {
        setCharacters(cachedData.mine);
        setLoading(false);
        return;
      }

      // Check localStorage for 'mine' tab
      if (tab === 'mine') {
        const cached = localStorage.getItem(`cached_mine_characters_${user.uid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setCharacters(parsed);
          setLoading(false);
          // We still fetch in background to update
        } else {
          setLoading(true);
        }
      } else {
        setLoading(true);
      }
    }

    try {
      if (tab === 'recent') {
        const chatsRef = collection(dbChat, 'chats');
        const q = query(chatsRef, where('userId', '==', user.uid), orderBy('updatedAt', 'desc'), limit(15));
        const snapshot = await getDocs(q);
        
        const chats: any[] = [];
        const creatorIds = new Set<string>();
        
        snapshot.docs.forEach(chatDoc => {
          const chatData = chatDoc.data();
          const charId = chatData.characterId || (chatData.characterIds && chatData.characterIds[0]);
          
          chats.push({
            id: chatDoc.id,
            ...chatData,
            characterId: charId || 'unknown',
            character: { 
              id: charId || 'unknown', 
              name: chatData.characterName || 'Unknown Character', 
              avatarUrl: chatData.characterAvatarUrl || '',
              creatorName: chatData.creatorName || 'Unknown',
              creatorId: chatData.creatorId || null,
              likesCount: chatData.likesCount || 0,
              interactionsCount: chatData.interactionsCount || 0,
              averageRating: chatData.averageRating
            }
          });
        });
        
        setRecentChats(chats);
        updateGlobalCache('recent', chats);
        setCachedData(prev => ({ ...prev, recent: chats }));
      } else {
        const charactersRef = collection(db, 'characters');
        let q;
        
        if (tab === 'public') {
          const pageSize = 15;
          if (isLoadMore && lastVisible) {
            q = query(charactersRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(pageSize));
          } else {
            q = query(charactersRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(pageSize));
          }
        } else {
          q = query(charactersRef, where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));
        }

        const snapshot = await getDocs(q);
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastVisible(lastDoc);
        if (tab === 'public') {
          setHasMore(snapshot.docs.length === 15);
        } else {
          setHasMore(false);
        }

        const chars: Character[] = [];
        const creatorIds = new Set<string>();
        
        snapshot.forEach((doc) => {
          const data = doc.data() as Record<string, any>;
          
          chars.push({ 
            id: doc.id, 
            ...data,
            creatorName: data.creatorName || 'Unknown'
          } as Character);
        });

        // Add local characters if tab is 'mine'
        if (tab === 'mine') {
          const localChars = getLocalCharacters();
          // Filter out any that might already be in Firestore (though they shouldn't be)
          const localToAdd = localChars.filter(lc => !chars.some(c => c.id === lc.id));
          chars.push(...(localToAdd as any[]));
          
          // Sort by updatedAt
          chars.sort((a, b) => {
            const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt || 0);
            const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt || 0);
            return dateB.getTime() - dateA.getTime();
          });
        }

        if (isLoadMore) {
          setCharacters(prev => {
            const combined = [...prev, ...chars];
            const seen = new Set();
            return combined.filter(item => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });
          });
        } else {
          setCharacters(chars);
        }

        if (tab === 'public') {
          const updatedPublic = isLoadMore ? [...cachedData.public, ...chars] : chars;
          updateGlobalCache('public', updatedPublic);
          setCachedData(prev => ({ ...prev, public: updatedPublic }));
          if (!isLoadMore) {
            localStorage.setItem('cached_public_characters', JSON.stringify(chars));
            localStorage.setItem('last_public_fetch', Date.now().toString());
          }
        } else {
          updateGlobalCache('mine', chars);
          setCachedData(prev => ({ ...prev, mine: chars }));
          localStorage.setItem(`cached_mine_characters_${user.uid}`, JSON.stringify(chars));
        }
      }
    } catch (error: any) {
      if (isQuotaError(error)) {
        setLocalQuotaExceeded(true);
      } else {
        handleFirestoreError(error, OperationType.LIST, tab === 'recent' ? 'chats' : 'characters');
      }
    } finally {
      setLoading(false);
      setIsFetchingMore(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, tab]);

  const fetchRecentCharacters = async () => {
    if (!user) return;
    if (cachedRecentCharacters.length > 0) {
      setRecentCharacters(cachedRecentCharacters);
      return;
    }
    setIsFetchingRecent(true);
    try {
      const chatsRef = collection(dbChat, 'chats');
      const q = query(chatsRef, where('userId', '==', user.uid), limit(20));
      const snapshot = await getDocs(q);
      
      const charIds = new Set<string>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.characterId) charIds.add(data.characterId);
        if (data.characterIds) {
          data.characterIds.forEach((id: string) => charIds.add(id));
        }
      });

      if (charIds.size === 0) {
        setRecentCharacters([]);
        return;
      }

      const charIdsArray = Array.from(charIds).slice(0, 30);
      
      const chars: Character[] = [];
      for (let i = 0; i < charIdsArray.length; i += 30) {
        const chunk = charIdsArray.slice(i, i + 30);
        const charQ = query(collection(db, 'characters'), where('__name__', 'in', chunk));
        const charSnap = await getDocs(charQ);
        charSnap.forEach(doc => chars.push({ id: doc.id, ...doc.data() } as Character));
      }
      setRecentCharacters(chars);
      setCachedRecentCharacters(chars);
    } catch (error) {
      console.error('Error fetching recent characters:', error);
    } finally {
      setIsFetchingRecent(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        const performSearch = async () => {
          try {
            const charsRef = collection(db, 'characters');
            const q = query(
              charsRef, 
              where('visibility', '==', 'public'),
              where('name_lowercase', '>=', searchQuery.toLowerCase()),
              where('name_lowercase', '<=', searchQuery.toLowerCase() + '\uf8ff'),
              limit(5)
            );
            const snapshot = await getDocs(q);
            const results: Character[] = [];
            snapshot.forEach(doc => {
              results.push({ id: doc.id, ...doc.data() } as Character);
            });
            setSearchResults(results);
          } catch (error) {
            console.error('Error searching characters:', error);
          }
        };
        performSearch();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = (queryStr: string) => {
    setSearchQuery(queryStr);
  };

  const toggleCharacterSelection = (char: Character) => {
    setSelectedCharacters(prev => {
      if (prev.find(c => c.id === char.id)) {
        return prev.filter(c => c.id !== char.id);
      }
      return [...prev, char];
    });
  };

  const handleCreateGroupChat = async () => {
    if (!user || selectedCharacters.length < 1) return;
    
    setIsCreating(true);
    try {
      const charIds = selectedCharacters.map(c => c.id);
      const chatRef = await addDoc(collection(dbChat, 'chats'), {
        userId: user.uid,
        characterIds: charIds,
        characterId: charIds[0], // legacy support for single-character views
        characterName: selectedCharacters[0].name,
        characterAvatarUrl: selectedCharacters[0].avatarUrl,
        creatorName: selectedCharacters[0].creatorName || 'Unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: selectedCharacters.length > 1 ? `Group Chat with ${selectedCharacters.map(c => c.name).join(', ')}` : `Chat with ${selectedCharacters[0].name}`
      });
      
      navigate(`/chat/${charIds[0]}/${chatRef.id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (isGroupChatModalOpen) {
      fetchRecentCharacters();
    }
  }, [isGroupChatModalOpen]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold text-white tracking-tight">
          {tab === 'recent' ? t('common.recentChats') : t('common.discover')}
        </h1>
        <p className="text-zinc-400">
          {tab === 'recent' ? t('common.recentSub') : t('common.discoverSub')}
        </p>
        
        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 w-full sm:w-fit overflow-x-auto no-scrollbar">
            <button
              onClick={() => setTab('public')}
              className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                tab === 'public' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('common.tabForYou')}
            </button>
            <button
              onClick={() => setTab('recent')}
              className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                tab === 'recent' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('common.tabRecent')}
            </button>
            <button
              onClick={() => setTab('mine')}
              className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                tab === 'mine' 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('common.tabMine')}
            </button>
            <Link
              to="/community"
              className="flex-1 sm:flex-none px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-zinc-400 hover:text-zinc-200"
            >
              {t('common.community')}
            </Link>
          </div>

          <button
            onClick={() => setIsGroupChatModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-900/20"
          >
            <Users className="w-4 h-4" />
            {t('common.btnCreateGroup')}
          </button>

          {tab === 'recent' && recentChats.length > 0 && (
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-medium transition-all shadow-lg ${
                isEditMode 
                  ? 'bg-red-600 text-white shadow-red-900/20' 
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {isEditMode ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
              {isEditMode ? t('common.btnDone') : t('common.btnDeleteChats')}
            </button>
          )}
        </div>
      </div>

      {quotaExceeded && (
        <div className="mb-6 bg-amber-600/20 border border-amber-600/30 px-6 py-4 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-amber-500 font-medium text-sm sm:text-base">
            <ShieldAlert className="w-6 h-6 flex-shrink-0" />
            <span>{t('common.quotaWarnHome')}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 h-64 animate-pulse">
              <div className="w-20 h-20 bg-zinc-800 rounded-full mx-auto mb-4"></div>
              <div className="h-4 bg-zinc-800 rounded w-3/4 mx-auto mb-2"></div>
              <div className="h-3 bg-zinc-800 rounded w-1/2 mx-auto"></div>
            </div>
          ))}
        </div>
      ) : tab === 'recent' ? (
        recentChats.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center">
            <MessageCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">{t('common.noRecentChats')}</h3>
            <p className="text-zinc-400 mb-6">{t('common.noRecentChatsSub')}</p>
            <button 
              onClick={() => setTab('public')}
              className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-xl transition-colors"
            >
              {t('common.browseCharacters')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {recentChats.map((chat) => (
              <div key={chat.id} className="relative group">
                <div 
                  onClick={() => !isEditMode && navigate(`/chat/${chat.characterId}/${chat.id}`)}
                  className={`flex flex-col items-center text-center bg-zinc-900 border border-zinc-800 rounded-2xl p-4 transition-all h-full ${
                    !isEditMode ? 'hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer' : 'opacity-75 cursor-default'
                  }`}
                >
                  <div className="relative">
                    {chat.character.avatarUrl ? (
                      <img src={chat.character.avatarUrl} alt={chat.character.name} className="w-20 h-20 rounded-full object-cover border border-zinc-700 mb-3" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 mb-3">
                        <Bot className="w-10 h-10 text-zinc-400" />
                      </div>
                    )}
                    {chat.characterIds && chat.characterIds.length > 1 && (
                      <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1 rounded-full border-2 border-zinc-900 shadow-lg" title={t('common.groupChat')}>
                        <Users className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white line-clamp-1">
                    {chat.title || chat.character.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                    {chat.characterIds && chat.characterIds.length > 1 
                      ? `${chat.characterIds.length} ${t('common.personas').toLowerCase()}` 
                      : (
                        <>
                          {t('common.by')} {chat.character.creatorId ? (
                            <Link 
                              to={`/profile/${chat.character.creatorId}`} 
                              className="hover:text-indigo-400 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {chat.character.creatorName || 'Unknown'}
                            </Link>
                          ) : (
                            chat.character.creatorName || 'Unknown'
                          )}
                        </>
                      )}
                  </p>
                  
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                    {chat.character.averageRating && (
                      <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                        <Star className="w-3 h-3 fill-current" />
                        {chat.character.averageRating.toFixed(1)}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-zinc-400 text-[10px]">
                      <Users className="w-3 h-3" />
                      {chat.character.interactionsCount || 0}
                    </div>
                    <div className="flex items-center gap-1 text-zinc-400 text-[10px]">
                      <span className="text-[10px]">♥</span>
                      {chat.character.likesCount || 0}
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={(e) => handleDeleteClick(e, chat.id)}
                  disabled={isDeletingChat === chat.id}
                  className={`absolute -top-3 -right-3 p-4 bg-red-600 text-white rounded-full shadow-2xl transition-all z-50 ${
                    isEditMode ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-90 hover:scale-100'
                  }`}
                  title={t('common.btnDeleteChats')}
                >
                  {isDeletingChat === chat.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-6 h-6" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )
      ) : characters.length === 0 ? (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center">
          <MessageCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">{t('common.noCharactersFound')}</h3>
          <p className="text-zinc-400 mb-6">
            {tab === 'public' 
              ? t('common.noPublicCharacters') 
              : t('common.noPersonasYet')}
          </p>
          <Link 
            to="/create" 
            className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-xl transition-colors"
          >
            {t('common.btnCreateACharacter')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {characters.map((char) => (
            <div key={char.id} className="relative group">
              <button
                  onClick={(e) => toggleFavorite(e, char.id)}
                  className="absolute top-2 left-2 p-2 rounded-full bg-zinc-800/80 backdrop-blur-sm hover:bg-zinc-700 transition-colors z-10"
                >
                  <Heart className={`w-4 h-4 ${favorites.has(char.id) ? 'fill-red-500 text-red-500' : 'text-zinc-400'}`} />
                </button>
              <button
                  onClick={(e) => openReportModal(e, char)}
                  className="absolute top-2 right-2 p-2 rounded-full bg-zinc-800/80 backdrop-blur-sm hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors z-10 opacity-0 group-hover:opacity-100"
                  title={t('community.reportPost')}
                >
                  <ShieldAlert className="w-4 h-4" />
                </button>
              <div 
                onClick={() => navigate(`/chat/${char.id}`)}
                className="flex flex-col items-center text-center bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-4 transition-all hover:shadow-lg hover:shadow-indigo-500/10 h-full cursor-pointer"
              >
                {char.avatarUrl ? (
                  <img src={char.avatarUrl} alt={char.name} className="w-20 h-20 rounded-full object-cover border border-zinc-700 mb-3" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 mb-3">
                    <User className="w-10 h-10 text-zinc-400" />
                  </div>
                )}
                <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{char.name}</h3>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                  {t('common.by')} <Link 
                    to={`/profile/${char.creatorId}`} 
                    className="hover:text-indigo-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {char.creatorName || 'Unknown'}
                  </Link>
                </p>
                
                <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                  {char.averageRating && (
                    <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <Star className="w-3 h-3 fill-current" />
                      {char.averageRating.toFixed(1)}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-zinc-400 text-[10px]">
                    <Users className="w-3 h-3" />
                    {char.interactionsCount || 0}
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400 text-[10px]">
                    <span className="text-[10px]">♥</span>
                    {char.likesCount || 0}
                  </div>
                </div>
              </div>
              
              {tab === 'mine' && (
                <Link
                  to={`/edit/${char.id}`}
                  className="absolute top-2 right-2 p-2 bg-zinc-800/80 backdrop-blur-sm hover:bg-indigo-600 text-zinc-400 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10"
                  title={t('common.edit')}
                >
                  <Edit2 className="w-4 h-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-red-500" />
              {t('common.reportCharacter')}
            </h3>
            <p className="text-zinc-400 mb-4">
              {t('common.reportCharDesc')}
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t('common.reportCharPlaceholder')}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all h-32 mb-4 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsReportModalOpen(false);
                  setReportReason('');
                }}
                className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason.trim() || isSubmittingReport}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmittingReport ? <Loader2 className="w-5 h-5 animate-spin" /> : t('community.submitReport')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {chatToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">{t('common.deleteChatTitle')}</h3>
            <p className="text-zinc-400 mb-6">
              {t('common.deleteChatDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setChatToDelete(null)}
                className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmDeleteChat}
                disabled={isDeletingChat !== null}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isDeletingChat !== null ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    {t('common.delete')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Chat Modal */}
      {isGroupChatModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  <Users className="w-6 h-6 text-indigo-500" />
                  {t('common.createGroupChat')}
                </h3>
                <p className="text-sm text-zinc-400 mt-1">{t('common.createGroupChatSub')}</p>
              </div>
              <button 
                onClick={() => setIsGroupChatModalOpen(false)}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Selected Characters Bar */}
              {selectedCharacters.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">{t('common.selected')} ({selectedCharacters.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCharacters.map(char => (
                      <div key={char.id} className="flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/50 rounded-full py-1.5 pl-1.5 pr-3">
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt={char.name} className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                            <User className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <span className="text-xs font-medium text-indigo-200">{char.name}</span>
                        <button 
                          onClick={() => toggleCharacterSelection(char)} 
                          className="p-2 -mr-2 hover:text-white text-indigo-400 transition-colors"
                          aria-label="Remove character"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  placeholder={t('common.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl py-3 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">{t('common.searchResults')}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {searchResults.map((char) => {
                      const isSelected = selectedCharacters.find(c => c.id === char.id);
                      return (
                        <button
                          key={char.id}
                          onClick={() => toggleCharacterSelection(char)}
                          className={`flex flex-col items-center text-center p-4 rounded-2xl border transition-all relative group ${
                            isSelected 
                              ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10' 
                              : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2 bg-indigo-500 rounded-full p-1 shadow-lg">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {char.avatarUrl ? (
                            <img src={char.avatarUrl} alt={char.name} className="w-16 h-16 rounded-full object-cover border border-zinc-700 mb-3" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600 mb-3">
                              <User className="w-8 h-8 text-zinc-400" />
                            </div>
                          )}
                          <p className="text-sm font-bold text-white line-clamp-1">{char.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent Characters */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">{t('common.recentCharacters')}</h4>
                {isFetchingRecent ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  </div>
                ) : recentCharacters.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-8 italic">{t('common.noRecentCharacters')}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {recentCharacters.map((char) => {
                      const isSelected = selectedCharacters.find(c => c.id === char.id);
                      return (
                        <button
                          key={char.id}
                          onClick={() => toggleCharacterSelection(char)}
                          className={`flex flex-col items-center text-center p-4 rounded-2xl border transition-all relative group ${
                            isSelected 
                              ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10' 
                              : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2 bg-indigo-500 rounded-full p-1 shadow-lg">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {char.avatarUrl ? (
                            <img src={char.avatarUrl} alt={char.name} className="w-16 h-16 rounded-full object-cover border border-zinc-700 mb-3" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600 mb-3">
                              <User className="w-8 h-8 text-zinc-400" />
                            </div>
                          )}
                          <p className="text-sm font-bold text-white line-clamp-1">{char.name}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {t('common.groupChatNote')}
              </p>
              <button
                onClick={handleCreateGroupChat}
                disabled={selectedCharacters.length === 0 || isCreating}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-900/20"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('common.creating')}
                  </>
                ) : (
                  <>
                    {selectedCharacters.length > 1 ? t('common.startGroupChat') : t('common.startChat')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === 'public' && hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => fetchData(true)}
            disabled={isFetchingMore}
            className="px-8 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-medium border border-zinc-800 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isFetchingMore ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('common.loadMore')
            )}
          </button>
        </div>
      )}
    </div>
  );
}
