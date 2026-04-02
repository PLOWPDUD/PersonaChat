import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, User, Globe, Lock, Bot, Edit2 } from 'lucide-react';

interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  greeting: string;
  description: string;
  visibility: 'public' | 'private';
  creatorId: string;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {tab === 'recent' ? 'Recent Chats' : 'Characters'}
          </h1>
          <p className="text-zinc-400 mt-1">
            {tab === 'recent' ? 'Continue your conversations.' : 'Discover and chat with AI personalities.'}
          </p>
        </div>
        
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 w-fit overflow-x-auto">
          <button
            onClick={() => setTab('public')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === 'public' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            Public
          </button>
          <button
            onClick={() => setTab('recent')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === 'recent' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Recent
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
              tab === 'mine' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="w-4 h-4" />
            My Characters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-48 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-full"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
                  <div className="h-3 bg-zinc-800 rounded w-1/4"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-zinc-800 rounded w-full"></div>
                <div className="h-3 bg-zinc-800 rounded w-5/6"></div>
              </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentChats.map((chat) => (
              <Link 
                key={chat.id} 
                to={`/chat/${chat.characterId}`}
                className="group bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-6 transition-all hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col h-full"
              >
                <div className="flex items-center gap-4 mb-4">
                  {chat.character.avatarUrl ? (
                    <img src={chat.character.avatarUrl} alt={chat.character.name} className="w-12 h-12 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                      <Bot className="w-6 h-6 text-zinc-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{chat.character.name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Last active: {chat.updatedAt && typeof chat.updatedAt.toDate === 'function' 
                        ? chat.updatedAt.toDate().toLocaleDateString() 
                        : 'Just now'}
                    </p>
                  </div>
                </div>
                
                <p className="text-sm text-zinc-400 line-clamp-2 flex-1 italic">
                  "{chat.character.greeting}"
                </p>
                
                <div className="mt-6 pt-4 border-t border-zinc-800/50 flex items-center text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Continue chat
                </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((char) => (
            <div 
              key={char.id} 
              className="group bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-6 transition-all hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col h-full relative"
            >
              {char.creatorId === user?.uid && (
                <Link
                  to={`/edit/${char.id}`}
                  className="absolute top-4 right-4 p-2 bg-zinc-800 hover:bg-indigo-600 text-zinc-400 hover:text-white rounded-xl transition-all z-10 border border-zinc-700"
                  title="Edit Character"
                >
                  <Edit2 className="w-4 h-4" />
                </Link>
              )}
              
              <Link to={`/chat/${char.id}`} className="flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {char.avatarUrl ? (
                      <img src={char.avatarUrl} alt={char.name} className="w-14 h-14 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <User className="w-6 h-6 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{char.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-1">
                        {char.visibility === 'private' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        <span className="capitalize">{char.visibility}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-zinc-400 line-clamp-3 flex-1">
                  {char.greeting}
                </p>
                
                <div className="mt-6 pt-4 border-t border-zinc-800/50 flex items-center text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Chat now
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
