import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, deleteDoc, getDocs, where, limit, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateCharacterResponse } from '../lib/gemini';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, User, Bot, ArrowLeft, Loader2, Trash2, Edit2, Check, X, RefreshCw, MoreVertical, BookOpen, MessageSquare, Plus, History, ChevronRight, Star, Flag, Image as ImageIcon, AlertCircle, UserPlus, Search } from 'lucide-react';

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
  creatorId: string;
  ratingCount?: number;
  totalRatingScore?: number;
  averageRating?: number;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  characterId?: string;
  content: string;
  imageUrl?: string;
  createdAt: any;
}

interface Memory {
  id: string;
  content: string;
  createdAt: any;
}

export function Chat() {
  const { characterId, chatId: urlChatId } = useParams<{ characterId: string; chatId?: string }>();
  const { user, isOwner, isModerator } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [characters, setCharacters] = useState<Character[]>([]);
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
  const [lastInput, setLastInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'lore'>('chat');
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryEditMode, setIsHistoryEditMode] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingCharacter, setIsDeletingCharacter] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAddCharacterModalOpen, setIsAddCharacterModalOpen] = useState(false);
  const [recentCharacters, setRecentCharacters] = useState<Character[]>([]);
  const [isFetchingRecent, setIsFetchingRecent] = useState(false);
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Character[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [respondingCharacterId, setRespondingCharacterId] = useState<string | null>(null);
  const [userPersona, setUserPersona] = useState('');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const fetchUserPersona = async () => {
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        setUserPersona(profileSnap.data().userPersona || '');
      }
    };
    fetchUserPersona();
  }, [user]);

  useEffect(() => {
    if (notification && notification.type === 'success') {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (isAddCharacterModalOpen) {
      fetchRecentCharacters();
    }
  }, [isAddCharacterModalOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setNotification({ message: 'Image size must be less than 5MB', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const maxDim = 800;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        setSelectedImage(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const fetchRecentCharacters = async () => {
    if (!user) return;
    setIsFetchingRecent(true);
    try {
      // Get recent chats to find characters the user has talked with
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('userId', '==', user.uid), orderBy('updatedAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      
      const charIds = new Set<string>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.characterId) charIds.add(data.characterId);
        if (data.characterIds) {
          data.characterIds.forEach((id: string) => charIds.add(id));
        }
      });

      // Remove characters already in the current chat
      characters.forEach(c => charIds.delete(c.id));

      if (charIds.size === 0) {
        setRecentCharacters([]);
        return;
      }

      // Fetch character details
      const chars: Character[] = [];
      const charIdsArray = Array.from(charIds).slice(0, 10); // Limit to 10 for now
      
      for (const id of charIdsArray) {
        const charDoc = await getDoc(doc(db, 'characters', id));
        if (charDoc.exists()) {
          chars.push({ id: charDoc.id, ...charDoc.data() } as Character);
        }
      }
      setRecentCharacters(chars);
    } catch (error) {
      console.error('Error fetching recent characters:', error);
    } finally {
      setIsFetchingRecent(false);
    }
  };

  const handleCharacterSearch = async (queryStr: string) => {
    setCharacterSearchQuery(queryStr);
    if (queryStr.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const charsRef = collection(db, 'characters');
      // Simple search by name (case-sensitive in Firestore, but we can do a prefix search)
      const q = query(
        charsRef, 
        where('visibility', '==', 'public'),
        where('name_lowercase', '>=', queryStr.toLowerCase()),
        where('name_lowercase', '<=', queryStr.toLowerCase() + '\uf8ff'),
        limit(5)
      );
      const snapshot = await getDocs(q);
      const results: Character[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as Character;
        if (!characters.some(c => c.id === doc.id)) {
          results.push({ id: doc.id, ...data });
        }
      });
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching characters:', error);
    }
  };

  const handleAddCharacterToChat = async (char: Character) => {
    if (!chatId) return;
    
    try {
      const chatRef = doc(db, 'chats', chatId);
      const currentIds = characters.map(c => c.id);
      if (currentIds.includes(char.id)) return;

      const newIds = [...currentIds, char.id];
      await updateDoc(chatRef, {
        characterIds: newIds,
        updatedAt: serverTimestamp()
      });

      // Update local state
      setCharacters(prev => [...prev, char]);
      setIsAddCharacterModalOpen(false);
      setNotification({ message: `${char.name} added to the chat!`, type: 'success' });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
      setNotification({ message: `Failed to add character: ${error.message}`, type: 'error' });
    }
  };

  const handleRateCharacter = async (score: number) => {
    if (!user || characters.length === 0) return;
    const primaryChar = characters[0];
    
    setIsSubmittingRating(true);
    try {
      const ratingRef = doc(db, `characters/${primaryChar.id}/ratings`, user.uid);
      const ratingSnap = await getDoc(ratingRef);
      
      const charRef = doc(db, 'characters', primaryChar.id);
      
      if (ratingSnap.exists()) {
        const oldScore = ratingSnap.data().score;
        const scoreDiff = score - oldScore;
        
        await setDoc(ratingRef, {
          score,
          updatedAt: serverTimestamp()
        }, { merge: true });
        
        const newTotalScore = (primaryChar.totalRatingScore || 0) + scoreDiff;
        const newAverage = newTotalScore / (primaryChar.ratingCount || 1);
        
        await setDoc(charRef, {
          totalRatingScore: newTotalScore,
          averageRating: newAverage
        }, { merge: true });
        
      } else {
        await setDoc(ratingRef, {
          userId: user.uid,
          characterId: primaryChar.id,
          score,
          createdAt: serverTimestamp()
        });
        
        const newCount = (primaryChar.ratingCount || 0) + 1;
        const newTotalScore = (primaryChar.totalRatingScore || 0) + score;
        const newAverage = newTotalScore / newCount;
        
        await setDoc(charRef, {
          ratingCount: newCount,
          totalRatingScore: newTotalScore,
          averageRating: newAverage
        }, { merge: true });
      }
      
      setUserRating(score);
      setIsRatingOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `characters/${characters[0].id}/ratings/${user.uid}`);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleReport = async () => {
    if (!user || characters.length === 0 || !reportReason.trim()) return;
    
    setIsSubmittingReport(true);
    try {
      const reportRef = doc(collection(db, 'reports'));
      await setDoc(reportRef, {
        reporterId: user.uid,
        targetId: characters[0].id,
        type: 'character',
        reason: reportReason.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsReportModalOpen(false);
      setReportReason('');
      setNotification({ message: 'Report submitted successfully.', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleDeleteCharacter = async () => {
    if (!isOwner || characters.length === 0) return;
    
    setIsDeletingCharacter(true);
    try {
      const charRef = doc(db, 'characters', characters[0].id);
      await deleteDoc(charRef);
      navigate('/');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `characters/${characters[0].id}`);
      setNotification({ message: `Failed to delete character: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsDeletingCharacter(false);
      setIsDeleteModalOpen(false);
    }
  };

  const handleNewChat = async () => {
    if (!user || characters.length === 0) return;
    const primaryChar = characters[0];
    const charIds = characters.map(c => c.id);
    
    setLoading(true);
    try {
      const newChatRef = doc(collection(db, 'chats'));
      const newChatId = newChatRef.id;
      
      await setDoc(newChatRef, {
        userId: user.uid,
        characterIds: charIds,
        characterId: characterId, // legacy
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        title: `Chat with ${characters.length > 1 ? 'Group' : primaryChar.name}`
      });
      
      await addDoc(collection(db, `chats/${newChatId}/messages`), {
        chatId: newChatId,
        role: 'model',
        characterId: primaryChar.id,
        content: primaryChar.greeting,
        createdAt: serverTimestamp()
      });
      
      navigate(`/chat/${characterId}/${newChatId}`);
      setIsHistoryOpen(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
      setNotification({ message: `Failed to create new chat: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!chatId || characters.length === 0) return;
    const primaryChar = characters[0];
    
    setIsClearing(true);
    try {
      const messagesRef = collection(db, `chats/${chatId}/messages`);
      const snapshot = await getDocs(query(messagesRef));
      
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      await addDoc(collection(db, `chats/${chatId}/messages`), {
        chatId,
        role: 'model',
        characterId: primaryChar.id,
        content: primaryChar.greeting,
        createdAt: serverTimestamp()
      });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
      setNotification({ message: `Failed to clear history: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsClearing(false);
    }
  };

  const saveSplitMessages = async (chatId: string, aiResponse: string, targetCharId?: string | null) => {
    // Split by "Name: " at the beginning of a line
    const lines = aiResponse.split('\n');
    let currentMessages: { charId: string | null, name: string | null, content: string }[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex !== -1 && colonIndex < 50) {
        const name = trimmedLine.substring(0, colonIndex).trim();
        const char = characters.find(c => c.name.toLowerCase() === name.toLowerCase() || c.name.split(' ')[0].toLowerCase() === name.toLowerCase());
        
        if (char) {
          currentMessages.push({
            charId: char.id,
            name: char.name,
            content: trimmedLine.substring(colonIndex + 1).trim()
          });
          continue;
        }
      }
      
      // If no name found or it's a continuation line
      if (currentMessages.length > 0) {
        currentMessages[currentMessages.length - 1].content += '\n' + trimmedLine;
      } else {
        // Fallback for first line if no name found
        const fallbackChar = targetCharId 
          ? characters.find(c => c.id === targetCharId) || characters[0]
          : characters[0];
          
        currentMessages.push({
          charId: fallbackChar.id,
          name: fallbackChar.name,
          content: trimmedLine
        });
      }
    }

    // Save each message sequentially to help with ordering
    for (const msg of currentMessages) {
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'model',
          characterId: msg.charId || characters[0].id,
          content: msg.content,
          createdAt: serverTimestamp()
        });
        // Small delay to ensure distinct timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `chats/${chatId}/messages`);
      }
    }
  };

  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;
    
    setIsDeletingChat(true);
    try {
      await deleteDoc(doc(db, 'chats', chatToDelete));
      if (chatId === chatToDelete) {
        navigate('/');
      } else {
        setChatHistory(prev => prev.filter(c => c.id !== chatToDelete));
      }
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatToDelete}`);
      setNotification({ message: `Failed to delete chat: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsDeletingChat(false);
      setChatToDelete(null);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, targetChatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setChatToDelete(targetChatId);
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!chatId || !newContent.trim() || characters.length === 0 || !user) return;
    
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
          content: m.content,
          imageUrl: m.imageUrl,
          characterId: m.characterId
        }));
        
        const memoryList = memories.map(m => m.content);
        
        let enhancedPrompt = newContent.trim();
        let targetCharId: string | null = null;
        
        if (characters.length > 1) {
          const mentionedChars = characters.filter(c => 
            enhancedPrompt.toLowerCase().includes(c.name.toLowerCase()) || 
            enhancedPrompt.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
          );
          
          if (mentionedChars.length > 0) {
            if (mentionedChars.length === 1) {
              targetCharId = mentionedChars[0].id;
            }
            const mentionGuidance = `(STRICT: Only ${mentionedChars.map(c => c.name).join(' and ')} should respond to this message. Other characters MUST remain silent.)`;
            enhancedPrompt = `${enhancedPrompt}\n\n${mentionGuidance}`;
          }
        }
        
        const aiResponse = await generateCharacterResponse(characters, updatedHistory, enhancedPrompt, originalMessage.imageUrl || undefined, memoryList, selectedModel, userPersona);

        // Save new AI messages
        if (aiResponse) {
          await saveSplitMessages(chatId, aiResponse, targetCharId);
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
    if (!chatId || characters.length === 0 || isTyping || isRegenerating) return;

    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    if (messages[messageIndex].role !== 'model') return;

    setIsRegenerating(true);
    setIsTyping(true);

    try {
      const historyUntilThis = messages.slice(0, messageIndex);
      const lastUserMsgIndex = [...historyUntilThis].reverse().findIndex(m => m.role === 'user');
      
      let prompt = "";
      let finalHistory: any[] = [];

      if (lastUserMsgIndex !== -1) {
        const actualIndex = historyUntilThis.length - 1 - lastUserMsgIndex;
        const lastUserMsg = historyUntilThis[actualIndex];
        prompt = lastUserMsg.content;
        const userImageUrl = lastUserMsg.imageUrl;
        finalHistory = historyUntilThis.slice(0, actualIndex).map(m => ({
          role: m.role,
          content: m.content,
          imageUrl: m.imageUrl,
          characterId: m.characterId
        }));
        
        const memoryList = memories.map(m => m.content);
        const aiResponse = await generateCharacterResponse(characters, finalHistory, prompt, userImageUrl || undefined, memoryList, selectedModel, userPersona);

        const messageRef = doc(db, `chats/${chatId}/messages`, messageId);
        await setDoc(messageRef, {
          content: aiResponse,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        prompt = "(Continue the conversation)";
        finalHistory = historyUntilThis.map(m => ({
          role: m.role,
          content: m.content,
          imageUrl: m.imageUrl,
          characterId: m.characterId
        }));
        
        const memoryList = memories.map(m => m.content);
        const aiResponse = await generateCharacterResponse(characters, finalHistory, prompt, undefined, memoryList, selectedModel);

        const messageRef = doc(db, `chats/${chatId}/messages`, messageId);
        await setDoc(messageRef, {
          content: aiResponse,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

    } catch (error: any) {
      console.error('Error regenerating message:', error);
      setNotification({ message: `Failed to regenerate message: ${error.message || 'Unknown error'}`, type: 'error' });
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
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/messages/${messageId}`);
      setNotification({ message: `Failed to delete message: ${error.message || 'Unknown error'}`, type: 'error' });
    }
  };

  const handleSkipResponse = async () => {
    if (!chatId || characters.length === 0 || isTyping || isRegenerating) return;

    setIsRegenerating(true);
    setIsTyping(true);

    try {
      const historyForGemini = messages.map(m => ({
        role: m.role,
        content: m.content,
        imageUrl: m.imageUrl,
        characterId: m.characterId
      }));

      const memoryList = memories.map(m => m.content);
      
      // Find the last character who spoke
      const lastModelMessage = [...messages].reverse().find(m => m.role === 'model');
      const lastCharId = lastModelMessage?.characterId;
      
      let skipPrompt = "(The user has skipped their turn. Exactly ONE character should respond now to continue the conversation or address another character. Do not include multiple characters in your response.)";
      let targetCharId: string | null = null;
      
      if (respondingCharacterId) {
        const targetChar = characters.find(c => c.id === respondingCharacterId);
        if (targetChar) {
          targetCharId = targetChar.id;
          skipPrompt = `(The user has skipped their turn. ${targetChar.name} should respond now.)`;
        }
        setRespondingCharacterId(null);
      } else if (lastCharId && characters.length > 1) {
        const lastChar = characters.find(c => c.id === lastCharId);
        const otherChars = characters.filter(c => c.id !== lastCharId);
        if (lastChar && otherChars.length > 0) {
          // Choose the next character in the list
          const lastIndex = characters.findIndex(c => c.id === lastCharId);
          const nextIndex = (lastIndex + 1) % characters.length;
          const nextChar = characters[nextIndex];
          targetCharId = nextChar.id;
          
          const lastFirstName = lastChar.name.split(' ')[0];
          const nextFirstName = nextChar.name.split(' ')[0];
          skipPrompt = `(The user has skipped their turn. ${lastFirstName}, speak with ${nextFirstName}. ${nextFirstName} should respond now.)`;
        }
      }

      const aiResponse = await generateCharacterResponse(characters, historyForGemini, skipPrompt, undefined, memoryList, selectedModel, userPersona);

      if (aiResponse) {
        await saveSplitMessages(chatId, aiResponse, targetCharId);
      }

      try {
        await setDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `chats/${chatId}`);
      }
    } catch (error: any) {
      console.error('Error regenerating response:', error);
      setNotification({ message: `Failed to skip response: ${error.message || 'Unknown error'}`, type: 'error' });
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
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/memories`);
      setNotification({ message: `Failed to add memory: ${error.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!chatId) return;
    try {
      await deleteDoc(doc(db, `chats/${chatId}/memories`, memoryId));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/memories/${memoryId}`);
      setNotification({ message: `Failed to delete memory: ${error.message || 'Unknown error'}`, type: 'error' });
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
        let currentChatId = urlChatId;
        let charIds: string[] = [];

        // Check query params for group chat initialization
        const charsParam = searchParams.get('chars');
        if (charsParam) {
          charIds = charsParam.split(',');
        } else if (characterId) {
          charIds = [characterId];
        }

        if (currentChatId) {
          const chatSnap = await getDoc(doc(db, 'chats', currentChatId));
          if (chatSnap.exists()) {
            const chatData = chatSnap.data();
            charIds = chatData.characterIds || (chatData.characterId ? [chatData.characterId] : []);
          }
        }

        if (charIds.length === 0) {
          navigate('/search');
          return;
        }

        // 1. Fetch all characters
        const charPromises = charIds.map(id => getDoc(doc(db, 'characters', id)));
        const charSnaps = await Promise.all(charPromises);
        const fetchedChars = charSnaps
          .filter(s => s.exists())
          .map(s => ({ id: s.id, ...s.data() } as Character));
        
        if (fetchedChars.length === 0) {
          navigate('/404');
          return;
        }
        setCharacters(fetchedChars);
        const primaryChar = fetchedChars[0];

        // 2. Fetch user's rating for primary character
        const ratingRef = doc(db, `characters/${primaryChar.id}/ratings`, user.uid);
        try {
          const ratingSnap = await getDoc(ratingRef);
          if (ratingSnap.exists()) {
            setUserRating(ratingSnap.data().score);
          }
        } catch (e) {
          console.error('Error fetching rating:', e);
        }

        // 3. Find or create chat session
        if (!currentChatId) {
          // Try to find the latest chat for this character (single chat)
          const chatsRef = collection(db, 'chats');
          const q = query(
            chatsRef, 
            where('userId', '==', user.uid), 
            where('characterId', '==', characterId),
            orderBy('updatedAt', 'desc'),
            limit(1)
          );
          const chatDocs = await getDocs(q);
          
          if (!chatDocs.empty && !chatDocs.docs[0].data().characterIds) {
            currentChatId = chatDocs.docs[0].id;
            navigate(`/chat/${characterId}/${currentChatId}`, { replace: true });
          } else {
            // Create new chat if none exists
            const newChatRef = doc(collection(db, 'chats'));
            currentChatId = newChatRef.id;
            await setDoc(newChatRef, {
              userId: user.uid,
              characterIds: charIds,
              characterId: characterId, // legacy
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              title: `Chat with ${primaryChar.name}`
            });
            
            await addDoc(collection(db, `chats/${currentChatId}/messages`), {
              chatId: currentChatId,
              role: 'model',
              characterId: primaryChar.id,
              content: primaryChar.greeting,
              createdAt: serverTimestamp()
            });
            navigate(`/chat/${characterId}/${currentChatId}`, { replace: true });
          }
        }
        
        setChatId(currentChatId);
        
        // 3. Listen to messages
        const messagesRef = collection(db, `chats/${currentChatId}/messages`);
        const mq = query(messagesRef, orderBy('createdAt', 'asc'));
        
        const unsubscribe = onSnapshot(mq, (snapshot) => {
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
        const memQ = query(memoriesRef, orderBy('createdAt', 'desc'));
        
        const unsubscribeMemories = onSnapshot(memQ, (snapshot) => {
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
          where('characterIds', 'array-contains', characterId),
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
      } catch (error: any) {
        console.error('Chat initialization error:', error);
        setNotification({ 
          message: `Failed to load chat: ${error.message || 'Unknown error'}. Please try refreshing.`, 
          type: 'error' 
        });
        setLoading(false);
      }
    };

    initChat();
  }, [user, characterId, urlChatId, navigate]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || !user || !chatId || characters.length === 0 || isTyping) return;

    const userMessage = input.trim();
    const userImageUrl = selectedImage;
    setLastInput(userMessage);
    setInput('');
    setSelectedImage(null);
    setIsTyping(true);

    try {
      // 1. Save user message
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'user',
          content: userMessage,
          imageUrl: userImageUrl || null,
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
      const historyForGemini = messages.map(m => ({
        role: m.role,
        content: m.content,
        imageUrl: m.imageUrl,
        characterId: m.characterId
      }));

      const memoryList = memories.map(m => m.content);
      
      // Enhance user message with explicit mention guidance if needed
      let enhancedPrompt = userMessage;
      let targetCharId: string | null = null;
      
      if (characters.length > 1) {
        const mentionedChars = characters.filter(c => 
          userMessage.toLowerCase().includes(c.name.toLowerCase()) || 
          userMessage.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
        );
        
        if (respondingCharacterId) {
          const targetChar = characters.find(c => c.id === respondingCharacterId);
          if (targetChar) {
            targetCharId = targetChar.id;
            const mentionGuidance = `(STRICT: Only ${targetChar.name} should respond to this message. Other characters MUST remain silent.)`;
            enhancedPrompt = `${userMessage}\n\n${mentionGuidance}`;
          }
          setRespondingCharacterId(null);
        } else if (mentionedChars.length > 0) {
          if (mentionedChars.length === 1) {
            targetCharId = mentionedChars[0].id;
          }
          const mentionGuidance = `(STRICT: Only ${mentionedChars.map(c => c.name).join(' and ')} should respond to this message. Other characters MUST remain silent.)`;
          enhancedPrompt = `${userMessage}\n\n${mentionGuidance}`;
        }
      }

      const aiResponse = await generateCharacterResponse(characters, historyForGemini, enhancedPrompt, userImageUrl || undefined, memoryList, selectedModel, userPersona);

      // 3. Save AI message (split into multiple if needed)
      if (aiResponse) {
        await saveSplitMessages(chatId, aiResponse, targetCharId);
        
        // Update interactionsCount for all characters in the chat
        for (const char of characters) {
          await updateDoc(doc(db, 'characters', char.id), {
            interactionsCount: (char.interactionsCount || 0) + 1
          });
        }
      }

      // Update chat timestamp again
      try {
        await setDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `chats/${chatId}`);
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage = error?.message || "Unknown error occurred";
      setNotification({ message: `Error: ${errorMessage}`, type: 'error' });
      
      try {
        await addDoc(collection(db, `chats/${chatId}/messages`), {
          chatId,
          role: 'model',
          characterId: characters[0].id,
          content: `*OOC: Sorry, I'm having trouble connecting right now. Error details: ${errorMessage}*`,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error('Critical failure: Could not even send fallback message', e);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleRetry = () => {
    if (lastInput) {
      setInput(lastInput);
      setNotification(null);
    }
  };

  if (loading || characters.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const isCharacterCreator = user && characters.some(c => c.creatorId === user.uid);

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
              <div className="flex items-center gap-1">
                {chatHistory.length > 0 && (
                  <button
                    onClick={() => setIsHistoryEditMode(!isHistoryEditMode)}
                    className={`p-2 rounded-full transition-colors ${isHistoryEditMode ? 'bg-red-600/20 text-red-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                    title={isHistoryEditMode ? "Done" : "Delete Chats"}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={() => {
                    setIsHistoryOpen(false);
                    setIsHistoryEditMode(false);
                  }}
                  className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                <div
                  key={chat.id}
                  className="relative group"
                >
                  <div
                    onClick={() => {
                      if (isHistoryEditMode) return;
                      const targetCharId = chat.characterId || (chat.characterIds && chat.characterIds[0]) || characterId;
                      navigate(`/chat/${targetCharId}/${chat.id}`);
                      setIsHistoryOpen(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between ${
                      isHistoryEditMode ? 'opacity-75 cursor-default' : 'cursor-pointer'
                    } ${
                      chatId === chat.id 
                        ? 'bg-zinc-800 text-white border border-zinc-700' 
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-8">
                      <p className="text-sm font-medium truncate">
                        {chat.title || `Chat with ${characters[0]?.name}`}
                      </p>
                      <p className="text-[10px] opacity-50 mt-1">
                        {chat.updatedAt?.toDate() ? new Date(chat.updatedAt.toDate()).toLocaleString() : 'Just now'}
                      </p>
                    </div>
                    {!isHistoryEditMode && (
                      <ChevronRight className={`w-4 h-4 transition-transform ${chatId === chat.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`} />
                    )}
                  </div>
                  
                  <button
                    onClick={(e) => handleDeleteClick(e, chat.id)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-4 rounded-lg transition-all z-10 ${
                      isHistoryEditMode 
                        ? 'bg-red-600 text-white opacity-100 scale-100 shadow-lg' 
                        : 'text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100'
                    }`}
                    title="Delete Chat"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {chatToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Delete Chat?</h3>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to delete this chat history? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setChatToDelete(null)}
                className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteChat}
                disabled={isDeletingChat}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isDeletingChat ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-md w-[90%] ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <div className="flex items-start gap-3">
            {notification.type === 'success' ? <Check className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
            <div className="flex-1">
              <span className="font-medium block">{notification.message}</span>
              {notification.type === 'error' && (
                <div className="flex gap-2 mt-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(notification.message);
                      setNotification(prev => prev ? { ...prev, message: 'Copied to clipboard!' } : null);
                      setTimeout(() => setNotification(null), 2000);
                    }}
                    className="text-xs bg-black/20 hover:bg-black/30 px-2 py-1 rounded-lg transition-colors"
                  >
                    Copy Error Details
                  </button>
                  {notification.message.includes('API_HIGH_DEMAND') && (
                    <button 
                      onClick={handleRetry}
                      className="text-xs bg-white text-red-600 hover:bg-zinc-100 px-2 py-1 rounded-lg transition-colors font-bold"
                    >
                      Retry Now
                    </button>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Chat Header */}
      <div className="h-auto lg:h-20 bg-zinc-900 border-b border-zinc-800 flex flex-col sm:flex-row items-center gap-4 px-4 py-3 sm:py-0 z-30 sticky top-0">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex -space-x-3 overflow-hidden flex-shrink-0">
              {characters.map((char) => (
                char.avatarUrl ? (
                  <img key={char.id} src={char.avatarUrl} alt={char.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-zinc-900 shadow-lg" referrerPolicy="no-referrer" />
                ) : (
                  <div key={char.id} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-900 shadow-lg">
                    <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                  </div>
                )
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-lg font-semibold text-white leading-tight truncate flex items-center gap-2">
                {characters.length > 1 ? 'Group Chat' : characters[0]?.name}
                {characters.length === 1 && characters[0]?.averageRating && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-xs font-normal text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3 fill-current" />
                    {characters[0].averageRating.toFixed(1)}
                  </span>
                )}
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-400">
                {characters.length > 1 ? `${characters.length} characters` : 'AI Character'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:hidden">
            <button
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className={`
          flex-1 flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto
          ${isMoreMenuOpen ? 'flex' : 'hidden sm:flex'}
        `}>
          <div className="flex items-center gap-1 relative">
            <button
              onClick={() => setIsAddCharacterModalOpen(true)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
              title="Add Character to Chat"
            >
              <UserPlus className="w-5 h-5" />
            </button>

            <button
              onClick={() => setIsRatingOpen(!isRatingOpen)}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${userRating ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              title="Rate Character"
            >
              <Star className={`w-5 h-5 ${userRating ? 'fill-current' : ''}`} />
            </button>
            
            {isRatingOpen && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRateCharacter(star)}
                    disabled={isSubmittingRating}
                    className={`p-1 hover:scale-110 transition-transform ${isSubmittingRating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Star className={`w-6 h-6 ${(userRating || 0) >= star ? 'text-yellow-500 fill-current' : 'text-zinc-500'}`} />
                  </button>
                ))}
              </div>
            )}

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-zinc-800 text-zinc-300 text-xs sm:text-sm rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[120px] sm:max-w-none"
            >
              <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
              <option value="gemini-flash-latest">Gemini Flash</option>
              <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Lite</option>
              <option value="gemini-3.1-pro-preview">Gemini Pro</option>
            </select>
            
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all flex items-center gap-2"
              title="Chat History"
            >
              <History className="w-5 h-5" />
              <span className="hidden md:inline text-sm font-medium">History</span>
            </button>
            
            <div className="hidden sm:block w-px h-6 bg-zinc-800 mx-1" />

            <button
              onClick={() => setIsReportModalOpen(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-yellow-500 transition-all flex items-center gap-2"
              title="Report Character"
            >
              <Flag className="w-5 h-5" />
            </button>

            {(isCharacterCreator || isOwner) && (
              <button
                onClick={() => navigate(`/edit/${characterId}`)}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-indigo-400 transition-all flex items-center gap-2"
                title="Edit Character"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            )}

            {(isCharacterCreator || isOwner) && (
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-500 transition-all flex items-center gap-2"
                title="Delete Character (Admin)"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-medium transition-all ${
                activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <MessageSquare className="w-3 h-3 sm:w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('lore')}
              className={`flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-sm font-medium transition-all ${
                activeTab === 'lore' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <BookOpen className="w-3 h-3 sm:w-4 h-4" />
              Lore
            </button>
          </div>

          <button
            onClick={handleClearHistory}
            disabled={isClearing}
            className="p-2 hover:bg-red-500/10 rounded-full text-zinc-400 hover:text-red-400 transition-colors ml-1"
            title="Clear History"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
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
                const msgCharacter = !isUser ? characters.find(c => c.id === msg.characterId) || characters[0] : null;

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
                        msgCharacter?.avatarUrl ? (
                          <img src={msgCharacter.avatarUrl} alt={msgCharacter.name} className="w-8 h-8 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <Bot className="w-4 h-4 text-zinc-400" />
                          </div>
                        )
                      )}
                    </div>
                    
                    <div className={`max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      {!isUser && msgCharacter && (
                        <span className="text-[11px] font-medium text-zinc-500 mb-1 ml-1 uppercase tracking-wider">{msgCharacter.name}</span>
                      )}
                      <div className="relative group w-full">
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
                          {msg.imageUrl && msg.imageUrl.length > 0 && (
                            <div className="mb-3 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                              <img src={msg.imageUrl} alt="Attachment" className="max-w-full h-auto object-contain max-h-96" referrerPolicy="no-referrer" />
                            </div>
                          )}
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
                </div>
              );
            })}
              
              {isTyping && (
                <div className="flex gap-4 flex-row">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                      <Bot className="w-4 h-4 text-zinc-400" />
                    </div>
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
              {selectedImage && selectedImage.length > 0 && (
                <div className="mb-3 relative inline-block">
                  <img src={selectedImage} alt="Preview" className="w-20 h-20 object-cover rounded-xl border border-zinc-700" />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 p-1 bg-zinc-900 border border-zinc-700 rounded-full text-zinc-400 hover:text-white shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <form onSubmit={handleSend} className="relative flex items-center gap-2">
                <div className="relative flex-1 flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {characters.length > 1 && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/50 border border-zinc-800 rounded-full">
                      {characters.map(char => (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => setRespondingCharacterId(respondingCharacterId === char.id ? null : char.id)}
                          className={`relative transition-all duration-200 ${respondingCharacterId === char.id ? 'scale-110' : 'opacity-40 hover:opacity-80 hover:scale-105'}`}
                          title={`Make ${char.name} respond`}
                        >
                          {char.avatarUrl ? (
                            <img 
                              src={char.avatarUrl} 
                              alt={char.name} 
                              className={`w-7 h-7 rounded-full object-cover border-2 ${respondingCharacterId === char.id ? 'border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'border-transparent'}`}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className={`w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center border-2 ${respondingCharacterId === char.id ? 'border-indigo-500' : 'border-transparent'}`}>
                              <Bot className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          )}
                          {respondingCharacterId === char.id && (
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-indigo-500 rounded-full border border-zinc-950 shadow-sm" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTyping}
                    className="p-3 bg-zinc-900 border border-zinc-700 rounded-full text-zinc-400 hover:text-white transition-all disabled:opacity-50"
                    title="Upload Image"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={respondingCharacterId 
                        ? `Message ${characters.find(c => c.id === respondingCharacterId)?.name}...` 
                        : `Message ${characters.length > 1 ? 'Group' : characters[0]?.name || 'Character'}...`
                      }
                      disabled={isTyping}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-full pl-6 pr-14 py-3.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={(!input.trim() && !selectedImage) || isTyping}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
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
                Add specific details, facts, or context that {characters[0]?.name || 'the characters'} should always remember.
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

      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Flag className="w-5 h-5 text-yellow-500" />
              Report Character
            </h3>
            <p className="text-zinc-400 mb-4 text-sm">Please provide a reason for reporting this character.</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Reason for report..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] mb-6 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsReportModalOpen(false);
                  setReportReason('');
                }}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason.trim() || isSubmittingReport}
                className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmittingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Character Modal */}
      {isAddCharacterModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <UserPlus className="w-6 h-6 text-indigo-500" />
                Add Character
              </h3>
              <button 
                onClick={() => setIsAddCharacterModalOpen(false)}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search characters by name..."
                  value={characterSearchQuery}
                  onChange={(e) => handleCharacterSearch(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl py-3 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">Search Results</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {searchResults.map((char) => (
                      <button
                        key={char.id}
                        onClick={() => handleAddCharacterToChat(char)}
                        className="flex items-center gap-4 p-3 bg-zinc-800/50 hover:bg-indigo-600/20 border border-zinc-700 hover:border-indigo-500/50 rounded-2xl transition-all group text-left"
                      >
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt={char.name} className="w-12 h-12 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600">
                            <User className="w-6 h-6 text-zinc-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{char.name}</p>
                          <p className="text-xs text-zinc-500 line-clamp-1">{char.description}</p>
                        </div>
                        <Plus className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Characters */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">Recent Characters</h4>
                {isFetchingRecent ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  </div>
                ) : recentCharacters.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4 italic">No other recent characters found.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {recentCharacters.map((char) => (
                      <button
                        key={char.id}
                        onClick={() => handleAddCharacterToChat(char)}
                        className="flex items-center gap-4 p-3 bg-zinc-800/50 hover:bg-indigo-600/20 border border-zinc-700 hover:border-indigo-500/50 rounded-2xl transition-all group text-left"
                      >
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt={char.name} className="w-12 h-12 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600">
                            <User className="w-6 h-6 text-zinc-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{char.name}</p>
                          <p className="text-xs text-zinc-500 line-clamp-1">{char.description}</p>
                        </div>
                        <Plus className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 bg-zinc-900/80 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 text-center">
                Characters you've previously talked with will appear here. You can also search for public characters.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Delete Character Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete Character
            </h3>
            <p className="text-zinc-400 mb-6">Are you sure you want to delete this character? This action cannot be undone and will delete all associated chats and ratings.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCharacter}
                disabled={isDeletingCharacter}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingCharacter ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Delete Character
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
