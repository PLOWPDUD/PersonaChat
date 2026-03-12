import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateCharacterResponse } from '../lib/gemini';
import { Send, User, Bot, ArrowLeft, Loader2, Trash2 } from 'lucide-react';

interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  greeting: string;
  description: string;
  personality?: string;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: any;
}

export function Chat() {
  const { characterId } = useParams<{ characterId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [character, setCharacter] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleClearHistory = async () => {
    if (!chatId || !character) return;
    if (!window.confirm('Are you sure you want to clear the chat history? This cannot be undone.')) return;

    setIsClearing(true);
    try {
      const messagesRef = collection(db, `chats/${chatId}/messages`);
      const snapshot = await getDocs(query(messagesRef));
      
      // Delete all messages
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      // Add back the greeting
      await addDoc(collection(db, `chats/${chatId}/messages`), {
        chatId,
        role: 'model',
        content: character.greeting,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error clearing history:', error);
    } finally {
      setIsClearing(false);
    }
  };

  // Scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!loading) {
      // Small delay to ensure DOM has updated and images are rendering
      const timeoutId = setTimeout(() => scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth'), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, isTyping, loading]);

  // Load character and initialize chat
  useEffect(() => {
    if (!user || !characterId) return;

    const initChat = async () => {
      try {
        // 1. Fetch character
        const charRef = doc(db, 'characters', characterId);
        const charSnap = await getDoc(charRef);
        
        if (!charSnap.exists()) {
          navigate('/');
          return;
        }
        
        const charData = { id: charSnap.id, ...charSnap.data() } as Character;
        setCharacter(charData);

        // 2. Find or create chat session
        // For simplicity, we create a deterministic chat ID based on user and character
        // In a real app, you might want multiple chats per character, but this is simpler
        const currentChatId = `${user.uid}_${characterId}`;
        setChatId(currentChatId);
        
        const chatRef = doc(db, 'chats', currentChatId);
        const chatSnap = await getDoc(chatRef);
        
        if (!chatSnap.exists()) {
          // Create chat
          await setDoc(chatRef, {
            userId: user.uid,
            characterId: characterId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          
          // Add initial greeting
          await addDoc(collection(db, `chats/${currentChatId}/messages`), {
            chatId: currentChatId,
            role: 'model',
            content: charData.greeting,
            createdAt: serverTimestamp()
          });
        }

        // 3. Listen to messages
        const messagesRef = collection(db, `chats/${currentChatId}/messages`);
        const q = query(messagesRef, orderBy('createdAt', 'asc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs: Message[] = [];
          snapshot.forEach((doc) => {
            msgs.push({ id: doc.id, ...doc.data() } as Message);
          });
          setMessages(msgs);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `chats/${currentChatId}/messages`);
        });

        return () => unsubscribe();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'characters/chats');
        setLoading(false);
      }
    };

    initChat();
  }, [user, characterId, navigate]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || !chatId || !character || isTyping) return;

    const userMessage = input.trim();
    setInput('');
    setIsTyping(true);

    try {
      // 1. Save user message
      await addDoc(collection(db, `chats/${chatId}/messages`), {
        chatId,
        role: 'user',
        content: userMessage,
        createdAt: serverTimestamp()
      });

      // Update chat timestamp
      await setDoc(doc(db, 'chats', chatId), {
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Generate AI response
      // We need to pass the history. We exclude the very last one we just added if it hasn't synced yet,
      // but we can just use the local state `messages` which has the history up to now.
      const historyForGemini = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const aiResponse = await generateCharacterResponse(character, historyForGemini, userMessage);

      // 3. Save AI message
      await addDoc(collection(db, `chats/${chatId}/messages`), {
        chatId,
        role: 'model',
        content: aiResponse,
        createdAt: serverTimestamp()
      });

      // Update chat timestamp again
      await setDoc(doc(db, 'chats', chatId), {
        updatedAt: serverTimestamp()
      }, { merge: true });

    } catch (error) {
      console.error('Error sending message:', error);
      // Fallback error message in chat
      await addDoc(collection(db, `chats/${chatId}/messages`), {
        chatId,
        role: 'model',
        content: "*OOC: Sorry, I'm having trouble connecting right now. Please try again later.*",
        createdAt: serverTimestamp()
      });
    } finally {
      setIsTyping(false);
    }
  };

  if (loading || !character) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Chat Header */}
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm z-10">
        <button 
          onClick={() => navigate('/')}
          className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 flex-1">
          {character.avatarUrl ? (
            <img src={character.avatarUrl} alt={character.name} className="w-10 h-10 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
              <Bot className="w-5 h-5 text-zinc-400" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-white leading-tight">{character.name}</h2>
            <p className="text-xs text-zinc-400">AI Character</p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          disabled={isClearing}
          className="p-2 hover:bg-red-500/10 rounded-full text-zinc-400 hover:text-red-400 transition-colors"
          title="Clear History"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="flex-shrink-0 mt-1">
                {isUser ? (
                  user?.photoURL ? (
                    <img src={user.photoURL} alt="You" className="w-8 h-8 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )
                ) : (
                  character.avatarUrl ? (
                    <img src={character.avatarUrl} alt={character.name} className="w-8 h-8 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                      <Bot className="w-4 h-4 text-zinc-400" />
                    </div>
                  )
                )}
              </div>
              
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                isUser 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-zinc-800 text-zinc-100 rounded-tl-sm border border-zinc-700/50'
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{msg.content}</p>
              </div>
            </div>
          );
        })}
        
        {isTyping && (
          <div className="flex gap-4 flex-row">
            <div className="flex-shrink-0 mt-1">
              {character.avatarUrl ? (
                <img src={character.avatarUrl} alt={character.name} className="w-8 h-8 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                  <Bot className="w-4 h-4 text-zinc-400" />
                </div>
              )}
            </div>
            <div className="bg-zinc-800 text-zinc-100 rounded-2xl rounded-tl-sm border border-zinc-700/50 p-4 flex items-center gap-1.5">
              <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/50">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${character.name}...`}
            disabled={isTyping}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-full pl-6 pr-14 py-3.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
