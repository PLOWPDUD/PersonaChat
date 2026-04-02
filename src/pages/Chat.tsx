import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, deleteDoc, getDocs, where, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateCharacterResponse } from '../lib/gemini';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, User, Bot, ArrowLeft, Loader2, Trash2, Edit2, Check, X, RefreshCw, MoreVertical, BookOpen, MessageSquare, Plus, History, ChevronRight } from 'lucide-react';

interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  greeting: string;
  description: string;
  personality?: string;
  visibility: 'public' | 'private' | 'unlisted';
  likesCount: number;
  interactionsCount: number;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: any;
}

interface Memory {
  id: string;
  content: string;
  createdAt: any;
}

export function Chat() {
  const { characterId, chatId: urlChatId } = useParams<{ characterId: string; chatId?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [character, setCharacter] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'lore'>('chat');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleNewChat = async () => {
    if (!user || !characterId || !character) return;
    
    setLoading(true);
    try {
      const newChatRef = doc(collection(db, 'chats'));
      const newChatId = newChatRef.id;
      
      await setDoc(newChatRef, {
        userId: user.uid,
        characterId: characterId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: `Chat with ${character.name}`
      });
      
      await addDoc(collection(db, `chats/${newChatId}/messages`), {
        chatId: newChatId,
        role: 'model',
        content: character.greeting,
        createdAt: serverTimestamp()
      });
      
      navigate(`/chat/${characterId}/${newChatId}`);
      setIsHistoryOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!chatId || !character) return;
    
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
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!chatId || !newContent.trim() || !character || !user) return;
    
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const originalMessage = messages[messageIndex];
    const isUserMessage = originalMessage.role === 'user';

    try {
      // 1. Update the message itself
      const messageRef = doc(db, `chats/${chatId}/messages`, messageId);
      await setDoc(messageRef, {
        content: newContent.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setEditingMessageId(null);

      // 2. If it's a user message, we should regenerate the AI response
      if (isUserMessage) {
        setIsTyping(true);
        
        // Delete subsequent messages to "rewind" the conversation
        const subsequentMessages = messages.slice(messageIndex + 1);
        for (const msg of subsequentMessages) {
          try {
            await deleteDoc(doc(db, `chats/${chatId}/messages`, msg.id));
          } catch (e) {
            console.error('Error deleting subsequent message:', e);
          }
        }

        // Generate new AI response based on updated history
        const updatedHistory = messages.slice(0, messageIndex).map(m => ({
          role: m.role,
          content: m.content
        }));
        
        const memoryList = memories.map(m => m.content);
        const aiResponse = await generateCharacterResponse(character, updatedHistory, newContent.trim(), memoryList);

        // Save new AI message
        try {
          await addDoc(collection(db, `chats/${chatId}/messages`), {
            chatId,
            role: 'model',
            content: aiResponse,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, `chats/${chatId}/messages`);
        }

        // Update chat timestamp
        try {
          await setDoc(doc(db, 'chats', chatId), {
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `chats/${chatId}`);
        }
        
        setIsTyping(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (!chatId || !character || isTyping || isRegenerating) return;

    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // We can only regenerate 'model' messages
    if (messages[messageIndex].role !== 'model') return;

    setIsRegenerating(true);
    setIsTyping(true);

    try {
      // Find the user message that preceded this AI message
      // If this is the first message (greeting), we can't really "regenerate" it from a prompt,
      // but we could re-fetch the greeting. For now, let's assume it's a response to a user message.
      
      const historyUntilThis = messages.slice(0, messageIndex);
      // The last message in historyUntilThis should be the user prompt
      const lastUserMsgIndex = [...historyUntilThis].reverse().findIndex(m => m.role === 'user');
      
      let prompt = "";
      let finalHistory: {role: 'user' | 'model', content: string}[] = [];

      if (lastUserMsgIndex !== -1) {
        const actualIndex = historyUntilThis.length - 1 - lastUserMsgIndex;
        prompt = historyUntilThis[actualIndex].content;
        finalHistory = historyUntilThis.slice(0, actualIndex).map(m => ({
          role: m.role,
          content: m.content
        }));
      } else {
        // If no user message found, it might be the initial greeting or a skip-response case
        prompt = "(Continue the conversation)";
        finalHistory = historyUntilThis.map(m => ({
          role: m.role,
          content: m.content
        }));
      }

      const memoryList = memories.map(m => m.content);
      const aiResponse = await generateCharacterResponse(character, finalHistory, prompt, memoryList);

      // Update the existing AI message
      const messageRef = doc(db, `chats/${chatId}/messages`, messageId);
      await setDoc(messageRef, {
        content: aiResponse,
        updatedAt: serverTimestamp()
      }, { merge: true });

    } catch (error) {
      console.error('Error regenerating message:', error);
    } finally {
      setIsRegenerating(false);
      setIsTyping(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chatId) return;
    
    try {
      const messageRef = doc(db, `chats/${chatId}/messages`, messageId);
      await deleteDoc(messageRef);
      setMessageToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  const handleSkipResponse = async () => {
    if (!chatId || !character || isTyping || isRegenerating) return;

    setIsRegenerating(true);
    setIsTyping(true);

    try {
      // Use the existing history to generate a new AI response
      const historyForGemini = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      // Trigger AI response with a "continue" instruction
      const memoryList = memories.map(m => m.content);
      const aiResponse = await generateCharacterResponse(character, historyForGemini, "(Continue the story)", memoryList);

      // Save AI message
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'model',
          content: aiResponse,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `chats/${chatId}/messages`);
      }

      // Update chat timestamp
      try {
        await setDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `chats/${chatId}`);
      }
    } catch (error) {
      console.error('Error regenerating response:', error);
    } finally {
      setIsRegenerating(false);
      setIsTyping(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemory.trim() || !chatId) return;

    setIsAddingMemory(true);
    try {
      await addDoc(collection(db, `chats/${chatId}/memories`), {
        chatId,
        content: newMemory.trim(),
        createdAt: serverTimestamp()
      });
      setNewMemory('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/memories`);
    } finally {
      setIsAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!chatId) return;
    try {
      await deleteDoc(doc(db, `chats/${chatId}/memories`, memoryId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/memories/${memoryId}`);
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
        let charSnap;
        try {
          charSnap = await getDoc(charRef);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `characters/${characterId}`);
          return;
        }
        
        if (!charSnap.exists()) {
          navigate('/');
          return;
        }
        
        const charData = { id: charSnap.id, ...charSnap.data() } as Character;
        setCharacter(charData);

        // 2. Find or create chat session
        let currentChatId = urlChatId;
        
        if (!currentChatId) {
          // Try to find the latest chat for this character
          const chatsRef = collection(db, 'chats');
          const q = query(
            chatsRef, 
            where('userId', '==', user.uid), 
            where('characterId', '==', characterId),
            orderBy('updatedAt', 'desc'),
            limit(1)
          );
          const chatDocs = await getDocs(q);
          
          if (!chatDocs.empty) {
            currentChatId = chatDocs.docs[0].id;
            navigate(`/chat/${characterId}/${currentChatId}`, { replace: true });
          } else {
            // Create new chat if none exists
            const newChatRef = doc(collection(db, 'chats'));
            currentChatId = newChatRef.id;
            await setDoc(newChatRef, {
              userId: user.uid,
              characterId: characterId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              title: `Chat with ${charData.name}`
            });
            
            await addDoc(collection(db, `chats/${currentChatId}/messages`), {
              chatId: currentChatId,
              role: 'model',
              content: charData.greeting,
              createdAt: serverTimestamp()
            });
            navigate(`/chat/${characterId}/${currentChatId}`, { replace: true });
          }
        }

        setChatId(currentChatId);
        
        // 3. Listen to messages
        const messagesRef = collection(db, `chats/${currentChatId}/messages`);
        const q = query(messagesRef, orderBy('createdAt', 'asc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs: Message[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.createdAt || !doc.metadata.hasPendingWrites) {
              msgs.push({ id: doc.id, ...data } as Message);
            } else {
              msgs.push({ id: doc.id, ...data, createdAt: { toDate: () => new Date() } } as Message);
            }
          });
          setMessages(msgs);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `chats/${currentChatId}/messages`);
        });

        // 4. Listen to memories
        const memoriesRef = collection(db, `chats/${currentChatId}/memories`);
        const mq = query(memoriesRef, orderBy('createdAt', 'desc'));
        
        const unsubscribeMemories = onSnapshot(mq, (snapshot) => {
          const mems: Memory[] = [];
          snapshot.forEach((doc) => {
            mems.push({ id: doc.id, ...doc.data() } as Memory);
          });
          setMemories(mems);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `chats/${currentChatId}/memories`);
        });

        // 5. Listen to chat history
        const chatsRef = collection(db, 'chats');
        const hq = query(
          chatsRef, 
          where('userId', '==', user.uid), 
          where('characterId', '==', characterId),
          orderBy('updatedAt', 'desc')
        );
        
        const unsubscribeHistory = onSnapshot(hq, (snapshot) => {
          const history = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setChatHistory(history);
        });

        return () => {
          unsubscribe();
          unsubscribeMemories();
          unsubscribeHistory();
        };
      } catch (error) {
        console.error('Chat initialization error:', error);
        setLoading(false);
      }
    };

    initChat();
  }, [user, characterId, urlChatId, navigate]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || !chatId || !character || isTyping) return;

    const userMessage = input.trim();
    setInput('');
    setIsTyping(true);

    try {
      // 1. Save user message
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'user',
          content: userMessage,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `chats/${chatId}/messages`);
      }

      // Update chat timestamp
      try {
        await setDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `chats/${chatId}`);
      }

      // 2. Generate AI response
      // Pass the history BEFORE the new message to avoid role alternation errors
      // if the snapshot has already updated the messages state.
      const historyForGemini = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const memoryList = memories.map(m => m.content);
      const aiResponse = await generateCharacterResponse(character, historyForGemini, userMessage, memoryList);

      // 3. Save AI message
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'model',
          content: aiResponse,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `chats/${chatId}/messages`);
      }

      // Update chat timestamp again
      try {
        await setDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `chats/${chatId}`);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      // Fallback error message in chat
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'model',
          content: "*OOC: Sorry, I'm having trouble connecting right now. Please try again later.*",
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error('Critical failure: Could not even send fallback message', e);
      }
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
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative">
      {/* History Sidebar Overlay */}
      {isHistoryOpen && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 transition-all duration-300"
          onClick={() => setIsHistoryOpen(false)}
        >
          <div 
            className="absolute left-0 top-0 bottom-0 w-80 bg-zinc-900 border-r border-zinc-800 shadow-2xl flex flex-col transform transition-transform duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-500" />
                Chat History
              </h3>
              <button 
                onClick={() => setIsHistoryOpen(false)}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-900/20"
              >
                <Plus className="w-5 h-5" />
                New Chat
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {chatHistory.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => {
                    navigate(`/chat/${characterId}/${chat.id}`);
                    setIsHistoryOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all group ${
                    chatId === chat.id 
                      ? 'bg-zinc-800 text-white border border-zinc-700' 
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {chat.title || `Chat with ${character.name}`}
                      </p>
                      <p className="text-[10px] opacity-50 mt-1">
                        {chat.updatedAt?.toDate() ? new Date(chat.updatedAt.toDate()).toLocaleString() : 'Just now'}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${chatId === chat.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white leading-tight truncate">{character.name}</h2>
            <p className="text-xs text-zinc-400">AI Character</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all flex items-center gap-2"
            title="Chat History"
          >
            <History className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-medium">History</span>
          </button>
          
          <div className="w-px h-6 bg-zinc-800 mx-1" />
        </div>

        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab('lore')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'lore' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Lore
          </button>
        </div>

        <button
          onClick={handleClearHistory}
          disabled={isClearing}
          className="p-2 hover:bg-red-500/10 rounded-full text-zinc-400 hover:text-red-400 transition-colors ml-2"
          title="Clear History"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'chat' ? (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isEditing = editingMessageId === msg.id;

                return (
                  <div key={msg.id} className={`flex gap-4 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
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
                    
                    <div className={`max-w-[80%] relative group ${isUser ? 'items-end' : 'items-start'}`}>
                      {isEditing ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <textarea
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            className="w-full bg-zinc-800 border border-indigo-500 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[100px] resize-none"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingMessageId(null)}
                              className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditMessage(msg.id, editInput)}
                              className="p-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`relative rounded-2xl p-4 ${
                          isUser 
                            ? 'bg-indigo-600 text-white rounded-tr-sm' 
                            : 'bg-zinc-800 text-zinc-100 rounded-tl-sm border border-zinc-700/50'
                        }`}>
                          <div className="markdown-body prose prose-invert max-w-none text-[15px] leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                          
                          {/* Message Actions */}
                          <div className={`absolute -bottom-8 ${isUser ? 'right-0' : 'left-0'} z-20`}>
                            <button
                              onClick={() => setActiveMenuId(activeMenuId === msg.id ? null : msg.id)}
                              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 shadow-xl"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            
                            {activeMenuId === msg.id && (
                              <div className="absolute top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-1 w-32 z-30">
                                {!isUser && (
                                  <button
                                    onClick={() => {
                                      handleRegenerateMessage(msg.id);
                                      setActiveMenuId(null);
                                    }}
                                    className="flex items-center gap-2 w-full p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-indigo-400 text-sm transition-colors"
                                    disabled={isTyping || isRegenerating}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Regenerate
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditInput(msg.content);
                                    setActiveMenuId(null);
                                  }}
                                  className="flex items-center gap-2 w-full p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setMessageToDelete(msg.id);
                                    setActiveMenuId(null);
                                  }}
                                  className="flex items-center gap-2 w-full p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 text-sm transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
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
              <form onSubmit={handleSend} className="relative flex items-center gap-2">
                <div className="relative flex-1">
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={handleSkipResponse}
                  disabled={isTyping || isRegenerating}
                  className="p-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-all disabled:opacity-50 border border-zinc-700"
                  title="Skip response / Regenerate"
                >
                  <RefreshCw className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950/30">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-indigo-500" />
                Character Lore & Memories
              </h3>
              <p className="text-zinc-400 text-sm mt-1">
                Add specific details, facts, or context that {character.name} should always remember.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <form onSubmit={handleAddMemory} className="flex gap-2">
                <input
                  type="text"
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  placeholder="e.g. The user's name is Alex, they are in a forest..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                />
                <button
                  type="submit"
                  disabled={!newMemory.trim() || isAddingMemory}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </form>

              <div className="space-y-3">
                {memories.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
                    <p className="text-zinc-500">No memories added yet.</p>
                  </div>
                ) : (
                  memories.map((mem) => (
                    <div key={mem.id} className="group flex items-start justify-between gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl hover:border-zinc-700 transition-colors">
                      <p className="text-zinc-200 text-[15px] leading-relaxed">{mem.content}</p>
                      <button
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete Memory"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Delete Confirmation Modal */}
      {messageToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Message</h3>
            <p className="text-zinc-400 mb-6">Are you sure you want to delete this message? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setMessageToDelete(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMessage(messageToDelete)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
