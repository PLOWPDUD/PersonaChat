import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, User, Globe, Lock, Bot, Edit2, Star } from 'lucide-react';

interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  greeting: string;
  description: string;
  visibility: 'public' | 'private' | 'unlisted';
  creatorId: string;
  creatorName?: string;
  likesCount: number;
  interactionsCount: number;
  averageRating?: number;
}

export function Home() {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'public' | 'mine' | 'recent'>('public');

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        if (tab === 'recent') {
          const chatsRef = collection(db, 'chats');
          const q = query(chatsRef, where('userId', '==', user.uid), orderBy('updatedAt', 'desc'));
          const snapshot = await getDocs(q);
          
          const chats: any[] = [];
          for (const chatDoc of snapshot.docs) {
            const chatData = chatDoc.data();
            // Fetch character info for each chat
            const charRef = doc(db, 'characters', chatData.characterId);
            const charSnap = await getDoc(charRef);
            if (charSnap.exists()) {
              chats.push({
                id: chatDoc.id,
                ...chatData,
                character: { id: charSnap.id, ...charSnap.data() }
              });
            }
          }
          setRecentChats(chats);
        } else {
          const charactersRef = collection(db, 'characters');
          let q;
          
          if (tab === 'public') {
            q = query(charactersRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'));
          } else {
            q = query(charactersRef, where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'));
          }

          const snapshot = await getDocs(q);
          const chars: Character[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data() as Record<string, any>;
            chars.push({ id: doc.id, ...data } as Character);
          });
          
          setCharacters(chars);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, tab === 'recent' ? 'chats' : 'characters');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, tab]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold text-white tracking-tight">
          {tab === 'recent' ? 'Recent Chats' : 'Discover'}
        </h1>
        <p className="text-zinc-400">
          {tab === 'recent' ? 'Continue your conversations.' : 'Find your next favorite character.'}
        </p>
        
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 w-fit mt-4">
          <button
            onClick={() => setTab('public')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'public' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            For You
          </button>
          <button
            onClick={() => setTab('recent')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'recent' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Recent
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'mine' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            My Characters
          </button>
        </div>
      </div>

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
            <h3 className="text-xl font-medium text-white mb-2">No recent chats</h3>
            <p className="text-zinc-400 mb-6">Start a conversation with a character to see it here.</p>
            <button 
              onClick={() => setTab('public')}
              className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-xl transition-colors"
            >
              Browse Characters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {recentChats.map((chat) => (
              <Link 
                key={chat.id} 
                to={`/chat/${chat.characterId}/${chat.id}`}
                className="group bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-4 transition-all hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col items-center text-center"
              >
                {chat.character.avatarUrl ? (
                  <img src={chat.character.avatarUrl} alt={chat.character.name} className="w-20 h-20 rounded-full object-cover border border-zinc-700 mb-3" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 mb-3">
                    <Bot className="w-10 h-10 text-zinc-400" />
                  </div>
                )}
                <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{chat.character.name}</h3>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">By {chat.character.creatorName || 'Unknown'}</p>
                {chat.character.averageRating && (
                  <div className="flex items-center gap-1 mt-2 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                    <Star className="w-3 h-3 fill-current" />
                    {chat.character.averageRating.toFixed(1)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )
      ) : characters.length === 0 ? (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center">
          <MessageCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">No characters found</h3>
          <p className="text-zinc-400 mb-6">
            {tab === 'public' 
              ? "There aren't any public characters yet." 
              : "You haven't created any characters yet."}
          </p>
          <Link 
            to="/create" 
            className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-xl transition-colors"
          >
            Create a Character
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {characters.map((char) => (
            <div key={char.id} className="relative group">
              <Link 
                to={`/chat/${char.id}`}
                className="flex flex-col items-center text-center bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-4 transition-all hover:shadow-lg hover:shadow-indigo-500/10 h-full"
              >
                {char.avatarUrl ? (
                  <img src={char.avatarUrl} alt={char.name} className="w-20 h-20 rounded-full object-cover border border-zinc-700 mb-3" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 mb-3">
                    <User className="w-10 h-10 text-zinc-400" />
                  </div>
                )}
                <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{char.name}</h3>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">By {char.creatorName || 'Unknown'}</p>
                {char.averageRating && (
                  <div className="flex items-center gap-1 mt-2 text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                    <Star className="w-3 h-3 fill-current" />
                    {char.averageRating.toFixed(1)}
                  </div>
                )}
              </Link>
              
              {tab === 'mine' && (
                <Link
                  to={`/edit/${char.id}`}
                  className="absolute top-2 right-2 p-2 bg-zinc-800/80 backdrop-blur-sm hover:bg-indigo-600 text-zinc-400 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="Edit Character"
                >
                  <Edit2 className="w-4 h-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
