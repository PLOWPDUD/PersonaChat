import React, { useState, useEffect, useRef } from 'react';
import { db, dbPrivate, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, limit, getDocs, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Send, User, Loader2, Search, ArrowLeft, MessageSquare, Plus, X, Users, Bot, Image as ImageIcon, Check, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { addNotification } from '../lib/gamification';
import { playSound } from '../lib/sounds';
import { GoogleGenAI } from '@google/genai';
import { moderateImage } from '../services/aiService';
import { getCachedProfile, setCachedProfile } from '../lib/cache';

interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  participants: string[];
  characterIds?: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  updatedAt?: any;
  otherUser?: {
    uid: string;
    displayName: string;
    photoURL: string;
  };
}

interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  imageUrl?: string;
  isBot?: boolean;
  createdAt: any;
}

export default function Messages() {
  const { t } = useTranslation();
  const { user, profile, isOwner } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedBots, setSelectedBots] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [availableBots, setAvailableBots] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageMode, setMessageMode] = useState<'direct' | 'group'>('direct');
  const [isCreateDirectOpen, setIsCreateDirectOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Edit/Delete State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(dbPrivate, 'private_chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatList = snapshot.docs.map((chatDoc) => {
        const data = chatDoc.data();
        
        let otherUser = null;
        if (data.type !== 'group') {
          const otherUserId = data.participants.find((id: string) => id !== user.uid);
          if (otherUserId && data.participantInfo?.[otherUserId]) {
            otherUser = {
              uid: otherUserId,
              displayName: data.participantInfo[otherUserId].displayName,
              photoURL: data.participantInfo[otherUserId].photoURL
            };
          }
        }

        return {
          id: chatDoc.id,
          ...data,
          otherUser
        } as Chat;
      });
      setChats(chatList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching chats:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if ((isCreateGroupOpen || isCreateDirectOpen) && user) {
      const fetchAvailable = async () => {
        try {
          const interactedUids = new Set<string>();

          if (isOwner) {
            // Owner can talk to everyone - limit to 30 to save quota
            const allProfilesSnap = await getDocs(query(collection(db, 'profiles'), limit(30)));
            allProfilesSnap.docs.forEach(doc => interactedUids.add(doc.id));
          } else {
            // 1. Fetch followers - limit to 20
            const followersSnap = await getDocs(query(collection(db, 'followers'), where('followingId', '==', user.uid), limit(20)));
            followersSnap.docs.forEach(doc => interactedUids.add(doc.data().followerId));

            // 2. Fetch people who interacted with posts - simplified
            const postsSnap = await getDocs(query(collection(db, 'community_posts'), where('authorId', '==', user.uid), limit(5)));
            for (const postDoc of postsSnap.docs) {
              // Just fetch a few likes/comments to save quota
              const likesSnap = await getDocs(query(collection(db, `community_posts/${postDoc.id}/likes`), limit(5)));
              likesSnap.docs.forEach(doc => interactedUids.add(doc.id));
              
              const commentsSnap = await getDocs(query(collection(db, `community_posts/${postDoc.id}/comments`), limit(5)));
              commentsSnap.docs.forEach(doc => interactedUids.add(doc.data().authorId));
            }
          }

          // Remove self if present
          interactedUids.delete(user.uid);

          // Fetch profiles for these UIDs
          const uidsArray = Array.from(interactedUids);
          const profiles: any[] = [];
          
          if (uidsArray.length > 0) {
            // Check cache first for each UID
            const uncachedUids: string[] = [];
            uidsArray.forEach(uid => {
              const cached = getCachedProfile(uid);
              if (cached) profiles.push(cached);
              else uncachedUids.push(uid);
            });

            if (uncachedUids.length > 0) {
              // Firestore 'in' query limit is 10
              for (let i = 0; i < uncachedUids.length; i += 10) {
                const batch = uncachedUids.slice(i, i + 10);
                const profilesSnap = await getDocs(query(collection(db, 'profiles'), where('__name__', 'in', batch)));
                profilesSnap.docs.forEach(doc => {
                  const pData = { uid: doc.id, ...doc.data() };
                  profiles.push(pData);
                  setCachedProfile(doc.id, pData);
                });
              }
            }
          }

          setAvailableUsers(profiles);
          
          // Fetch bots - limit to 10
          const botsSnap = await getDocs(query(collection(db, 'characters'), limit(10)));
          setAvailableBots(botsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error('Error fetching available users/bots:', err);
        }
      };
      fetchAvailable();
    }
  }, [isCreateGroupOpen, isCreateDirectOpen, user, isOwner]);

  const handleCreateGroup = async () => {
    if (!user || !groupName.trim() || (selectedUsers.length === 0 && selectedBots.length === 0)) return;

    setIsSubmitting(true);
    try {
      const chatData = {
        type: 'group',
        name: groupName.trim(),
        participants: [user.uid, ...selectedUsers],
        characterIds: selectedBots,
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        lastMessage: 'Group created',
        lastMessageAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(dbPrivate, 'private_chats'), chatData);
      
      // Notify all participants
      const notificationPromises = selectedUsers.map(uId => 
        addNotification(uId, 'group_invite', 'Group Invite', `${profile?.displayName || 'Someone'} added you to the group "${groupName.trim()}"`, { chatId: docRef.id })
      );
      await Promise.all(notificationPromises);

      setIsCreateGroupOpen(false);
      setGroupName('');
      setSelectedUsers([]);
      setSelectedBots([]);
      setActiveChat({ id: docRef.id, ...chatData } as any);
      playSound('success');
    } catch (err) {
      console.error('Error creating group:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDirect = async (targetUserId: string) => {
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Check if chat already exists
      const q = query(
        collection(dbPrivate, 'private_chats'),
        where('type', '==', 'direct'),
        where('participants', 'array-contains', user.uid)
      );
      const snap = await getDocs(q);
      const existingChat = snap.docs.find(doc => doc.data().participants.includes(targetUserId));

      if (existingChat) {
        setActiveChat({ id: existingChat.id, ...existingChat.data() } as any);
      } else {
        // Fetch target user info for denormalization
        const targetSnap = await getDoc(doc(db, 'profiles', targetUserId));
        const targetData = targetSnap.data();

        const chatData = {
          type: 'direct',
          participants: [user.uid, targetUserId],
          participantInfo: {
            [user.uid]: {
              displayName: profile?.displayName || 'User',
              photoURL: profile?.photoURL || ''
            },
            [targetUserId]: {
              displayName: targetData?.displayName || 'User',
              photoURL: targetData?.photoURL || ''
            }
          },
          updatedAt: serverTimestamp(),
          lastMessage: 'Chat started',
          lastMessageAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(dbPrivate, 'private_chats'), chatData);
        setActiveChat({ id: docRef.id, ...chatData } as any);

        // Notify target user
        await addNotification(targetUserId, 'new_chat', 'New Message Request', `${profile?.displayName || 'Someone'} started a conversation with you.`, { chatId: docRef.id });
      }
      setIsCreateDirectOpen(false);
      playSound('success');
    } catch (err) {
      console.error('Error creating direct chat:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || !activeChat || (!newMessage.trim() && !selectedImage) || isSubmitting || isModerating) return;

    setIsSubmitting(true);
    const content = newMessage.trim();
    const imageUrl = selectedImage;
    setNewMessage('');
    setSelectedImage(null);
    playSound('click');

    try {
      await addDoc(collection(dbPrivate, `private_chats/${activeChat.id}/messages`), {
        senderId: user.uid,
        senderName: profile?.displayName || 'User',
        content,
        imageUrl,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(dbPrivate, 'private_chats', activeChat.id), {
        lastMessage: imageUrl ? 'Sent an image' : content,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Notify other users in group
      if (activeChat.type === 'group') {
        activeChat.participants.forEach(async (pId) => {
          if (pId !== user.uid) {
            await addNotification(pId, 'new_message', `New message in ${activeChat.name}`, `${profile?.displayName || 'Someone'}: ${imageUrl ? 'Sent an image' : content}`, { chatId: activeChat.id });
          }
        });
      } else if (activeChat.otherUser) {
        await addNotification(activeChat.otherUser.uid, 'new_message', 'New Message', `${profile?.displayName || 'Someone'} sent you a message.`, { chatId: activeChat.id });
      }

      // Bot Mention Logic
      if (activeChat.characterIds && activeChat.characterIds.length > 0) {
        for (const botId of activeChat.characterIds) {
          const bot = availableBots.find(b => b.id === botId);
          if (bot && content.toLowerCase().includes(`@${bot.name.toLowerCase()}`)) {
            // Trigger bot response
            handleBotResponse(bot, content);
          }
        }
      }

      playSound('success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'private_messages');
    } finally {
      setIsSubmitting(false);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
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
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setModerationError('Please select an image file.');
      return;
    }

    setIsModerating(true);
    setModerationError(null);

    try {
      const base64 = await compressImage(file);
      const pureBase64 = base64.split(',')[1];
      
      const result = await moderateImage(pureBase64, 'image/jpeg');
      
      if (result.isAppropriate) {
        setSelectedImage(base64);
      } else {
        setModerationError(result.suggestion || 'This image contains inappropriate content.');
      }
    } catch (err) {
      console.error('Error processing image:', err);
      setModerationError('Failed to process image.');
    } finally {
      setIsModerating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBotResponse = async (bot: any, userMessage: string) => {
    if (!activeChat) return;

    try {
      // Get recent context
      const recentMessages = messages.slice(-10).map(m => `${m.senderId === user?.uid ? 'User' : 'Other'}: ${m.content}`).join('\n');
      
      const prompt = `
        You are ${bot.name}. 
        Personality: ${bot.personality}
        
        Current conversation context:
        ${recentMessages}
        
        The user just said: "${userMessage}"
        
        Respond as ${bot.name} to the mention. Keep it concise and in character.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const responseText = result.text;

      await addDoc(collection(dbPrivate, `private_chats/${activeChat.id}/messages`), {
        senderId: bot.id,
        senderName: bot.name,
        content: responseText,
        isBot: true,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(dbPrivate, 'private_chats', activeChat.id), {
        lastMessage: responseText,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

    } catch (err) {
      console.error('Error getting bot response:', err);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeChat || !newContent.trim() || !user) return;
    try {
      const messageRef = doc(dbPrivate, `private_chats/${activeChat.id}/messages`, messageId);
      await updateDoc(messageRef, {
        content: newContent.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingMessageId(null);
      playSound('success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `private_chats/${activeChat.id}/messages/${messageId}`);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeChat) return;
    try {
      await deleteDoc(doc(dbPrivate, `private_chats/${activeChat.id}/messages`, messageId));
      setMessageToDelete(null);
      playSound('success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `private_chats/${activeChat.id}/messages/${messageId}`);
    }
  };

  useEffect(() => {
    if (!activeChat) return;

    setLoadingMessages(true);
    const q = query(
      collection(dbPrivate, `private_chats/${activeChat.id}/messages`),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(messageList);
      setLoadingMessages(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
      console.error('Error fetching messages:', error);
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [activeChat]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden h-[80vh] flex">
      {/* Chat List */}
      <div className={`w-full md:w-80 border-r border-zinc-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-500" />
              {t('messages.title')}
            </h2>
            <button 
              onClick={() => messageMode === 'group' ? setIsCreateGroupOpen(true) : setIsCreateDirectOpen(true)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all"
              title={messageMode === 'group' ? t('messages.createGroup') : t('messages.newDirect')}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex p-1 bg-zinc-950 rounded-xl border border-zinc-800">
            <button
              onClick={() => setMessageMode('direct')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                messageMode === 'direct' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <User className="w-3 h-3" />
              {t('messages.directTab')}
            </button>
            <button
              onClick={() => setMessageMode('group')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                messageMode === 'group' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users className="w-3 h-3" />
              {t('messages.groupsTab')}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {chats.filter(c => c.type === messageMode).length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm italic">
              {t('messages.noConversations', { mode: messageMode === 'group' ? t('messages.groupsTab').toLowerCase() : t('messages.directTab').toLowerCase() })}
            </div>
          ) : (
            chats.filter(c => c.type === messageMode).map(chat => (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={`w-full p-4 flex gap-3 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/50 ${activeChat?.id === chat.id ? 'bg-indigo-500/10' : ''}`}
              >
                {chat.otherUser?.photoURL ? (
                  <img src={chat.otherUser.photoURL} alt="" className="w-12 h-12 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <User className="w-6 h-6 text-zinc-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white font-bold truncate">
                    {chat.type === 'group' ? chat.name : chat.otherUser?.displayName}
                  </p>
                  <p className="text-zinc-400 text-xs truncate mt-0.5">{chat.lastMessage || t('messages.startConversation')}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`flex-1 flex flex-col bg-zinc-950 ${!activeChat ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
        {activeChat ? (
          <>
            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
              <button onClick={() => setActiveChat(null)} className="md:hidden p-2 text-zinc-400 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </button>
              {activeChat.otherUser?.photoURL ? (
                <img src={activeChat.otherUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                  <User className="w-5 h-5 text-zinc-500" />
                </div>
              )}
              <h3 className="text-white font-bold">
                {activeChat.type === 'group' ? activeChat.name : activeChat.otherUser?.displayName}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {loadingMessages ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm italic">
                  {t('messages.startPrompt')}
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col group ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                    {activeChat.type === 'group' && msg.senderId !== user?.uid && (
                      <span className="text-[10px] text-zinc-500 mb-1 ml-1">{msg.senderName || 'User'}</span>
                    )}
                    <div className="relative flex items-center gap-2 max-w-[90%] md:max-w-[80%]">
                      {msg.senderId === user?.uid && !editingMessageId && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditContent(msg.content);
                            }}
                            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                            title={t('common.edit')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setMessageToDelete(msg.id)}
                            className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="w-full">
                        {editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[200px] bg-zinc-800 p-3 rounded-2xl border border-indigo-500">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white text-sm focus:outline-none resize-none"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEditMessage(msg.id, editContent)}
                                className="p-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`p-3 rounded-2xl text-sm ${
                            msg.senderId === user?.uid 
                              ? 'bg-indigo-600 text-white rounded-tr-none' 
                              : msg.isBot 
                                ? 'bg-purple-600/20 border border-purple-500/30 text-purple-200 rounded-tl-none'
                                : 'bg-zinc-800 text-zinc-200 rounded-tl-none'
                          }`}>
                            {msg.imageUrl && (
                              <img 
                                src={msg.imageUrl} 
                                alt="" 
                                className="rounded-lg mb-2 max-w-full h-auto border border-white/10" 
                                referrerPolicy="no-referrer"
                              />
                            )}
                            {msg.content}
                            {msg.createdAt?.seconds && (
                              <div className={`text-[10px] mt-1 ${msg.senderId === user?.uid ? 'text-indigo-200 text-right' : 'text-zinc-500'}`}>
                                {new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {msg.senderId !== user?.uid && !editingMessageId && isOwner && (
                        <button
                          onClick={() => setMessageToDelete(msg.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-red-500 transition-all"
                          title="Delete (Admin)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {selectedImage && (
              <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/50 flex items-center gap-3">
                <div className="relative">
                  <img src={selectedImage} alt="Selected" className="w-16 h-16 rounded-lg object-cover border border-zinc-700" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 italic">{t('messages.imageReady')}</p>
              </div>
            )}

            {moderationError && (
              <div className="px-4 py-2 border-t border-red-900/30 bg-red-900/10 flex items-center gap-2 text-red-400 text-xs">
                <X className="w-3 h-3" />
                {moderationError}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-800 flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isModerating}
                className="p-2 bg-zinc-800 text-zinc-400 rounded-xl hover:text-white hover:bg-zinc-700 transition-all disabled:opacity-50"
              >
                {isModerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t('messages.placeholder')}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
              />
              <button
                type="submit"
                disabled={(!newMessage.trim() && !selectedImage) || isSubmitting || isModerating}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center min-w-[40px]"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center space-y-4 p-8">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto border border-zinc-800">
              <MessageSquare className="w-8 h-8 text-zinc-700" />
            </div>
            <h3 className="text-white font-bold">{t('messages.windowTitle')}</h3>
            <p className="text-zinc-500 text-sm max-w-xs mx-auto">
              {t('messages.windowSub')}
            </p>
          </div>
        )}
      </div>
      {/* Create Direct Message Modal */}
      <AnimatePresence>
        {isCreateDirectOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{t('messages.newDirectTitle')}</h2>
                <button onClick={() => setIsCreateDirectOpen(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">{t('messages.selectUser')}</label>
                <div className="max-h-60 overflow-y-auto space-y-2 no-scrollbar">
                  {availableUsers.length === 0 ? (
                    <p className="text-center py-8 text-zinc-500 text-sm italic">{t('messages.noUsers')}</p>
                  ) : (
                    availableUsers.map(u => (
                      <button
                        key={u.uid}
                        onClick={() => handleCreateDirect(u.uid)}
                        className="w-full p-3 rounded-xl flex items-center gap-3 bg-zinc-950 border border-zinc-800 hover:border-indigo-500/50 transition-all group"
                      >
                        <img src={u.photoURL || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full object-cover" />
                        <div className="flex-1 text-left">
                          <p className="text-sm text-white font-bold group-hover:text-indigo-400 transition-colors">{u.displayName}</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('messages.clickToStart')}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Group Modal */}
      <AnimatePresence>
        {isCreateGroupOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{t('messages.createGroup')}</h2>
                <button onClick={() => setIsCreateGroupOpen(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">{t('common.groupChat')}</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={t('common.placeholderFeedback')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">{t('common.add')} {t('common.user')}</label>
                  <div className="max-h-40 overflow-y-auto space-y-2 no-scrollbar">
                    {availableUsers.map(u => (
                      <button
                        key={u.uid}
                        onClick={() => setSelectedUsers(prev => prev.includes(u.uid) ? prev.filter(id => id !== u.uid) : [...prev, u.uid])}
                        className={`w-full p-2 rounded-xl flex items-center gap-3 transition-all ${selectedUsers.includes(u.uid) ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-zinc-950 border border-zinc-800'}`}
                      >
                        <img src={u.photoURL || 'https://via.placeholder.com/40'} alt="" className="w-8 h-8 rounded-full" />
                        <span className="text-sm text-white font-medium">{u.displayName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Add Bots</label>
                  <div className="max-h-40 overflow-y-auto space-y-2 no-scrollbar">
                    {availableBots.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBots(prev => prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id])}
                        className={`w-full p-2 rounded-xl flex items-center gap-3 transition-all ${selectedBots.includes(b.id) ? 'bg-purple-600/20 border border-purple-500/50' : 'bg-zinc-950 border border-zinc-800'}`}
                      >
                        <img src={b.avatarUrl || 'https://via.placeholder.com/40'} alt="" className="w-8 h-8 rounded-full" />
                        <span className="text-sm text-white font-medium">{b.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateGroup}
                disabled={isSubmitting || !groupName.trim() || (selectedUsers.length === 0 && selectedBots.length === 0)}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Group'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Delete Message Confirmation Modal */}
      <AnimatePresence>
        {messageToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-3 text-red-500">
                <Trash2 className="w-6 h-6" />
                <h3 className="text-xl font-bold text-white">Delete Message</h3>
              </div>
              <p className="text-zinc-400 text-sm">
                Are you sure you want to delete this message? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setMessageToDelete(null)}
                  className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteMessage(messageToDelete)}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
