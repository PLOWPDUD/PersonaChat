import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db, dbPrivate, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, limit, getDocs, deleteDoc, arrayRemove, setDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Send, User, Loader2, Search, ArrowLeft, MessageSquare, Plus, X, Users, Bot, Image as ImageIcon, Check, MoreVertical, Edit2, Trash2, Reply, Smile, ShieldAlert, FileText, Info, UserX, UserCheck, Download, Paperclip, Palette, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { addNotification } from '../lib/gamification';
import { playSound } from '../lib/sounds';
import { GoogleGenAI } from '@google/genai';
import { moderateImage } from '../services/aiService';
import { getCachedProfile, setCachedProfile } from '../lib/cache';
import { getChatTheme, CHAT_THEMES } from '../lib/chatThemes';

interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  participants: string[];
  characterIds?: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  updatedAt?: any;
  createdBy?: string;
  otherUser?: {
    uid: string;
    displayName: string;
    photoURL: string;
  };
  participantInfo?: Record<string, { displayName: string; photoURL: string }>;
}

interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderPhotoURL?: string;
  content: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  isBot?: boolean;
  createdAt: any;
  replyToId?: string;
  replyToContent?: string;
  replyToSenderName?: string;
  reactions?: Record<string, string[]>;
}

export default function Messages() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const msgThemeObj = getChatTheme(settings.messageTheme);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const { user, profile, isOwner, toggleBlockUser } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ url: string; name: string; type: string; size: number } | null>(null);
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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);

  const [localQuotaExceeded, setLocalQuotaExceeded] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const quotaExceeded = localQuotaExceeded || (typeof (useAuth() as any).quotaExceeded === 'boolean' ? (useAuth() as any).quotaExceeded : false);

  const isBlocked = (targetId: string) => profile?.blockedUsers?.includes(targetId);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(dbPrivate, 'private_chats'),
      where('participants', 'array-contains', user.uid),
      limit(40)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map((chatDoc) => {
        const data = chatDoc.data();
        
        let otherUser = null;
        if (data.type !== 'group') {
          const otherUserId = data.participants.find((id: string) => id !== user.uid);
          if (otherUserId) {
            const info = data.participantInfo?.[otherUserId];
            otherUser = {
              uid: otherUserId,
              displayName: info?.displayName || t('common.user'),
              photoURL: info?.photoURL || ''
            };
          }
        }

        return {
          id: chatDoc.id,
          ...data,
          otherUser,
          name: data.name || (data.type === 'group' ? t('messages.groupChat') : undefined)
        } as Chat;
      });

      // Sort client-side by updatedAt/lastMessageAt safely to avoid needing composite indexes
      chatList.sort((a: any, b: any) => {
        const getMs = (val: any) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (val.seconds) return val.seconds * 1000;
          if (val instanceof Date) return val.getTime();
          return Number(val) || 0;
        };
        const timeA = getMs(a.updatedAt) || getMs(a.lastMessageAt);
        const timeB = getMs(b.updatedAt) || getMs(b.lastMessageAt);
        return timeB - timeA;
      });

      setChats(chatList);
      setLoading(false);
    }, (error) => {
      if (isQuotaError(error)) {
        console.warn("Private chats sync hit quota.");
      } else {
        console.error("Error syncing private chats:", error);
      }
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
            // Owner can talk to everyone - fetch more to allow searching, but limit to prevent quota exhaustion
            const allProfilesSnap = await getDocs(query(collection(db, 'profiles'), limit(100)));
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

  // Debounced live-search for all profiles in Firestore (specifically useful for Owner to search any user)
  useEffect(() => {
    if ((!isCreateGroupOpen && !isCreateDirectOpen) || !user) return;
    if (searchQuery.trim().length < 2) return;

    const delayDebounce = setTimeout(async () => {
      try {
        const term = searchQuery.trim();
        const termCapitalized = term.charAt(0).toUpperCase() + term.slice(1);
        const termLower = term.toLowerCase();

        // Run queries in parallel across single-field indexes (requires NO composite indexes)
        const queryPromises = [
          getDocs(query(collection(db, 'profiles'), where('displayName', '>=', term), where('displayName', '<=', term + '\uf8ff'), limit(15))),
          getDocs(query(collection(db, 'profiles'), where('displayName', '>=', termCapitalized), where('displayName', '<=', termCapitalized + '\uf8ff'), limit(15))),
          getDocs(query(collection(db, 'profiles'), where('displayName', '>=', termLower), where('displayName', '<=', termLower + '\uf8ff'), limit(15))),
          getDocs(query(collection(db, 'profiles'), where('email', '==', termLower), limit(10)))
        ];

        const snapshots = await Promise.all(queryPromises);
        
        // Merge profiles by uid to avoid duplicate matches
        const foundProfiles = new Map<string, any>();
        snapshots.forEach(snap => {
          snap.docs.forEach(doc => {
            if (doc.id !== user.uid) {
              foundProfiles.set(doc.id, { uid: doc.id, ...doc.data() });
            }
          });
        });

        // Add them to availableUsers state if they aren't already included
        setAvailableUsers(prev => {
          const merged = new Map<string, any>();
          // Preserve existing pre-loaded or pre-selected ones
          prev.forEach(u => merged.set(u.uid, u));
          // Append/update newly matched profiles
          foundProfiles.forEach((u, uid) => merged.set(uid, u));
          return Array.from(merged.values());
        });

      } catch (err) {
        console.error("Error searching profiles from Firestore:", err);
      }
    }, 400); // 400ms debounce to prevent quota thrashing

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, isCreateGroupOpen, isCreateDirectOpen, user]);

  const handleCreateGroup = async () => {
    if (!user || !groupName.trim() || (selectedUsers.length === 0 && selectedBots.length === 0)) return;

    setIsSubmitting(true);
    try {
      const participantInfo = {
        [user.uid]: {
          displayName: profile?.displayName || 'User',
          photoURL: profile?.photoURL || ''
        }
      };

      selectedUsers.forEach(uId => {
        const u = availableUsers.find(au => au.uid === uId);
        if (u) {
          participantInfo[uId] = {
            displayName: u.displayName || 'User',
            photoURL: u.photoURL || ''
          };
        }
      });

      const chatData = {
        type: 'group',
        name: groupName.trim(),
        participants: [user.uid, ...selectedUsers],
        participantInfo,
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
    setSearchQuery('');
    try {
      // Check if chat already exists
      const q = query(
        collection(dbPrivate, 'private_chats'),
        where('participants', 'array-contains', user.uid)
      );
      const snap = await getDocs(q);
      const existingChat = snap.docs.find(doc => {
        const data = doc.data();
        return data.type === 'direct' && data.participants?.includes(targetUserId);
      });

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
    if (!user || !activeChat || (!newMessage.trim() && !selectedImage && !selectedFile) || isSubmitting || isModerating) return;

    // Check if other user has blocked us or we have blocked them
    if (activeChat.type === 'direct' && activeChat.otherUser) {
      if (profile?.blockedUsers?.includes(activeChat.otherUser.uid)) {
        setModerationError(t('messages.youBlocked', 'You have blocked this user. Unblock them to send messages.'));
        return;
      }
    }

    setIsSubmitting(true);
    const content = newMessage.trim();
    const imageUrl = selectedImage;
    const currentFile = selectedFile;
    const currentReplyTo = replyTo;
    
    setNewMessage('');
    setSelectedImage(null);
    setSelectedFile(null);
    setReplyTo(null);
    playSound('click');

    try {
      console.log('User profile:', profile);
      console.log('Sending message in chat:', activeChat.id, 'Participants:', activeChat.participants, 'ParticipantInfo:', activeChat.participantInfo);
      
      const newLocalMsg: Message = {
        id: `local_${Date.now()}`,
        senderId: user.uid,
        senderName: profile?.displayName || 'User',
        senderPhotoURL: profile?.photoURL || '',
        content,
        imageUrl,
        fileUrl: currentFile?.url || null,
        fileName: currentFile?.name || null,
        fileType: currentFile?.type || null,
        fileSize: currentFile?.size || null,
        replyToId: currentReplyTo?.id || null,
        replyToContent: currentReplyTo?.content || null,
        replyToSenderName: currentReplyTo?.senderName || null,
        createdAt: { toDate: () => new Date() } as any,
        reactions: {}
      };
      
      // ...
      setMessages(prev => [newLocalMsg, ...prev]);

      try {
        const { id, ...msgData } = newLocalMsg;
        // Optimization: Use Message Buckets to save reads
        const bucketRef = doc(dbPrivate, `private_chats/${activeChat.id}/buckets`, 'current');
        
        // Firestore arrayUnion doesn't support serverTimestamp() inside array objects.
        // We use a regular ISO string or timestamp number for sorting.
        const messageForBucket = {
          ...msgData,
          id: id.startsWith('local_') ? `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : id,
          createdAt: new Date().toISOString()
        };

        await setDoc(bucketRef, {
          messages: arrayUnion(messageForBucket),
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });

        await updateDoc(doc(dbPrivate, 'private_chats', activeChat.id), {
          lastMessage: imageUrl ? 'Sent an image' : currentFile ? `Sent a file: ${currentFile.name}` : content,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Final error sending message:', err);
        handleFirestoreError(err, OperationType.WRITE, `private_chats/${activeChat.id}/buckets/current`);
      }

      // Notify other users
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
          if (bot) {
            const hasMention = content.toLowerCase().includes(`@${bot.name.toLowerCase()}`) ||
                               content.toLowerCase().includes(bot.name.toLowerCase()) ||
                               content.toLowerCase().includes(bot.name.split(' ')[0].toLowerCase());
            if (hasMention) {
              // Trigger bot response
              handleBotResponse(bot, content);
            }
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 20MB limit as requested
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setModerationError('File size exceeds the 20MB limit.');
      return;
    }

    setIsModerating(true);
    setModerationError(null);

    try {
      if (file.type.startsWith('image/')) {
        const base64 = await compressImage(file);
        
        // Only moderate images if they are small enough for AI processing
        if (base64.length < 4000000) {
          const pureBase64 = base64.split(',')[1];
          const result = await moderateImage(pureBase64, 'image/jpeg');
          
          if (result.isAppropriate) {
            setSelectedImage(base64);
          } else {
            setModerationError(result.suggestion || 'This image contains inappropriate content.');
          }
        } else {
          setSelectedImage(base64);
        }
      } else {
        // For other files, we just read as data URL for local simulation
        // Note: Large base64 strings in Firestore will fail, but we show the UI
        const reader = new FileReader();
        reader.onload = (event) => {
          setSelectedFile({
            url: event.target?.result as string,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size
          });
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Error processing file:', err);
      setModerationError('Failed to process file.');
    } finally {
      setIsModerating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBotResponse = async (bot: any, userMessage: string, depth = 0) => {
    if (!activeChat) return;
    const chatId = activeChat.id;

    try {
      // Get recent context using sender names
      const recentMessages = messages
        .slice(-10)
        .map(m => `${m.senderName || 'Unknown'}: ${m.content}`)
        .join('\n');
      
      let instructionsText = `Respond as ${bot.name} in character to the last message / mention. Keep your response extremely concise, engaging, and in character. Do not mention yourself, but you are free to address other users or bots in the context.`;

      if (settings.aiInstructionsEnabled && settings.customAiInstructions) {
        if (settings.aiInstructionsMode === 'override') {
          instructionsText = settings.customAiInstructions;
        } else if (settings.aiInstructionsMode === 'prepend') {
          instructionsText = `${settings.customAiInstructions}\n\n${instructionsText}`;
        } else {
          instructionsText = `${instructionsText}\n\nCustom Instructions:\n${settings.customAiInstructions}`;
        }
      }

      const prompt = `
        You are ${bot.name}. 
        Personality: ${bot.personality}
        
        Current conversation context:
        ${recentMessages}
        
        Last message: "${userMessage}"
        
        Instructions:
        ${instructionsText}
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const responseText = result.text;

      // Ensure that the conversation is still active when we write
      if (activeChat.id !== chatId) return;

      const botMessageId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const bucketRef = doc(dbPrivate, `private_chats/${chatId}/buckets`, 'current');
      const botMsgData = {
        id: botMessageId,
        senderId: bot.id,
        senderName: bot.name,
        senderPhotoURL: bot.avatarUrl || '',
        content: responseText,
        isBot: true,
        createdAt: new Date().toISOString(),
        reactions: {}
      };

      await setDoc(bucketRef, {
        messages: arrayUnion(botMsgData),
        lastUpdatedAt: serverTimestamp()
      }, { merge: true });

      await updateDoc(doc(dbPrivate, 'private_chats', chatId), {
        lastMessage: responseText,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Bot-to-bot mention logic: trigger other bots if mentioned in the response
      if (depth < 3 && activeChat.characterIds && activeChat.characterIds.length > 0) {
        for (const otherBotId of activeChat.characterIds) {
          if (otherBotId === bot.id) continue;
          const otherBot = availableBots.find(b => b.id === otherBotId);
          if (otherBot) {
            const hasMention = responseText.toLowerCase().includes(`@${otherBot.name.toLowerCase()}`) ||
                               responseText.toLowerCase().includes(otherBot.name.toLowerCase()) ||
                               responseText.toLowerCase().includes(otherBot.name.split(' ')[0].toLowerCase());
            if (hasMention) {
              // Trigger other bot response with delay (1.5 seconds) for realistic pacing
              setTimeout(() => {
                if (activeChat.id === chatId) {
                  handleBotResponse(otherBot, responseText, depth + 1);
                }
              }, 1500);
            }
          }
        }
      }

    } catch (err) {
      console.error('Error getting bot response:', err);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!activeChat || !user) return;
    
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const currentReactions = message.reactions || {};
    const users = currentReactions[emoji] || [];
    
    let newUsers;
    if (users.includes(user.uid)) {
      newUsers = users.filter(uid => uid !== user.uid);
    } else {
      newUsers = [...users, user.uid];
    }

    const newReactions = { ...currentReactions };
    if (newUsers.length === 0) {
      delete newReactions[emoji];
    } else {
      newReactions[emoji] = newUsers;
    }

    try {
      const bucketRef = doc(dbPrivate, `private_chats/${activeChat.id}/buckets`, 'current');
      const bucketSnap = await getDoc(bucketRef);
      
      if (bucketSnap.exists()) {
        const messagesArr = (bucketSnap.data().messages || []) as any[];
        const updatedMessages = messagesArr.map(m => {
          if (m.id === messageId) {
            return { ...m, reactions: newReactions };
          }
          return m;
        });

        await updateDoc(bucketRef, { messages: updatedMessages });
        playSound('click');
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeChat || !newContent.trim() || !user) return;
    try {
      const bucketRef = doc(dbPrivate, `private_chats/${activeChat.id}/buckets`, 'current');
      const bucketSnap = await getDoc(bucketRef);
      
      if (bucketSnap.exists()) {
        const messagesArr = (bucketSnap.data().messages || []) as any[];
        const updatedMessages = messagesArr.map(m => {
          if (m.id === messageId) {
            return { ...m, content: newContent.trim(), updatedAt: new Date().toISOString() };
          }
          return m;
        });

        await updateDoc(bucketRef, { messages: updatedMessages });
        setEditingMessageId(null);
        playSound('success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `private_chats/${activeChat.id}/buckets/current`);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeChat) return;
    try {
      const bucketRef = doc(dbPrivate, `private_chats/${activeChat.id}/buckets`, 'current');
      const bucketSnap = await getDoc(bucketRef);
      
      if (bucketSnap.exists()) {
        const messagesArr = (bucketSnap.data().messages || []) as any[];
        const updatedMessages = messagesArr.filter(m => m.id !== messageId);
        await updateDoc(bucketRef, { messages: updatedMessages });
        setMessageToDelete(null);
        playSound('success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `private_chats/${activeChat.id}/buckets/current`);
    }
  };

  const handleRemoveBot = async (botId: string) => {
    if (!activeChat || !user || activeChat.createdBy !== user.uid) return;
    
    try {
      const chatRef = doc(dbPrivate, 'private_chats', activeChat.id);
      await updateDoc(chatRef, {
        characterIds: arrayRemove(botId)
      });
      playSound('success');
    } catch (err) {
      console.error('Error removing bot:', err);
      handleFirestoreError(err, OperationType.UPDATE, `private_chats/${activeChat.id}`);
    }
  };

  const handleDeleteChat = async () => {
    if (!user || !activeChat) return;
    
    const confirmMsg = activeChat.type === 'group' 
      ? t('messages.confirmLeaveGroup', 'Are you sure you want to leave this group?') 
      : t('messages.confirmDeleteChat', 'Are you sure you want to delete this conversation? This will delete it for everyone.');
      
    if (!window.confirm(confirmMsg)) return;

    try {
      const chatRef = doc(dbPrivate, 'private_chats', activeChat.id);
      
      if (activeChat.type === 'group') {
        // Just leave the group
        await updateDoc(chatRef, {
          participants: arrayRemove(user.uid)
        });
      } else {
        // Delete the entire direct chat
        await deleteDoc(chatRef);
      }
      
      setActiveChat(null);
      setIsInfoOpen(false);
      playSound('success');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `private_chats/${activeChat.id}`);
    }
  };


  useEffect(() => {
    if (!activeChat) return;

    setLoadingMessages(true);
    // Optimization: Listen to a single "current" bucket document instead of a whole collection.
    // This reduces reads from N (number of messages) to 1.
    const bucketRef = doc(dbPrivate, `private_chats/${activeChat.id}/buckets`, 'current');

    const unsubscribe = onSnapshot(bucketRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const bucketMessages = (data.messages || []) as any[];
        
        // Convert ISO strings/timestamps back to compatible objects for the UI
        const formattedMessages = bucketMessages.map(m => ({
          ...m,
          createdAt: typeof m.createdAt === 'string' ? { toDate: () => new Date(m.createdAt) } : m.createdAt
        })).sort((a: any, b: any) => {
          const timeA = new Date(a.createdAt?.toDate?.() || a.createdAt).getTime();
          const timeB = new Date(b.createdAt?.toDate?.() || b.createdAt).getTime();
          return timeA - timeB;
        });

        setMessages(formattedMessages);
      } else {
        // Fallback or empty state
        setMessages([]);
      }

      setLoadingMessages(false);
      
      // Auto scroll to bottom
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
      if (isQuotaError(error)) {
        console.warn("Messages sync hit quota.");
      } else {
        console.error("Error syncing private messages bucket:", error);
      }
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
                {chat.type === 'group' ? (
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Users className="w-6 h-6 text-indigo-400" />
                  </div>
                ) : chat.otherUser?.photoURL ? (
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
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveChat(null)} className="md:hidden p-2 text-zinc-400 hover:text-white">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                {activeChat.type === 'group' ? (
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Users className="w-5 h-5 text-indigo-400" />
                  </div>
                ) : activeChat.otherUser?.photoURL ? (
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
              <div className="flex items-center gap-2">
                {/* DM Theme Selector Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                    className={`p-2 rounded-xl transition-all flex items-center gap-1.5 ${
                      isThemeMenuOpen || settings.messageTheme !== 'default'
                        ? 'text-theme-primary bg-theme-primary/15'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                    title="Change Message Theme"
                  >
                    <Palette className="w-5 h-5" />
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </button>

                  {isThemeMenuOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsThemeMenuOpen(false)} 
                      />
                      <div className="absolute right-0 mt-2 w-72 bg-zinc-950 border border-zinc-800 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in-50 slide-in-from-top-2 duration-200">
                        <div className="px-2 py-1.5 border-b border-zinc-900 mb-2">
                          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Select DM Theme</h4>
                        </div>
                        <div className="space-y-0.5 max-h-60 overflow-y-auto pr-1 col-span-1">
                          {CHAT_THEMES.map((theme) => {
                            const isSelected = settings.messageTheme === theme.id;
                            return (
                              <button
                                key={theme.id}
                                onClick={() => {
                                  updateSettings({ messageTheme: theme.id });
                                  setIsThemeMenuOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 p-2 rounded-xl transition-all text-left cursor-pointer ${
                                  isSelected
                                    ? 'bg-zinc-900 border border-zinc-800 text-white'
                                    : 'hover:bg-zinc-900 text-zinc-400 hover:text-white border border-transparent'
                                }`}
                              >
                                <span className="text-xl flex-shrink-0">{theme.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                                    {theme.name}
                                  </p>
                                </div>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-theme-primary flex-shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button 
                  onClick={() => setIsInfoOpen(!isInfoOpen)}
                  className={`p-2 rounded-xl transition-all ${isInfoOpen ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar transition-all duration-300 ${msgThemeObj.backdropClass}`}>
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
                  <div key={msg.id} className={`flex gap-3 group ${msg.senderId === user?.uid ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="flex-shrink-0 mt-auto">
                      {!msg.isBot ? (
                        <Link to={`/profile/${msg.senderId}`} className="block hover:opacity-80 transition-opacity">
                          {msg.senderPhotoURL && msg.senderPhotoURL !== '' ? (
                            <img src={msg.senderPhotoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                          ) : activeChat.participantInfo?.[msg.senderId]?.photoURL && activeChat.participantInfo[msg.senderId].photoURL !== '' ? (
                            <img 
                              src={activeChat.participantInfo[msg.senderId].photoURL} 
                              alt="" 
                              className="w-8 h-8 rounded-full object-cover border border-zinc-800" 
                              referrerPolicy="no-referrer" 
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                              <User className="w-4 h-4 text-zinc-500" />
                            </div>
                          )}
                        </Link>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-purple-900/30 flex items-center justify-center border border-purple-500/30">
                          {msg.senderPhotoURL ? (
                            <img src={msg.senderPhotoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Bot className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                      {activeChat.type === 'group' && msg.senderId !== user?.uid && (
                        <span className="text-[10px] text-zinc-500 mb-1 ml-1">{msg.senderName || 'User'}</span>
                      )}
                      
                      <div className="relative flex items-center gap-2 group-hover:block">
                        <div className="w-full">
                          {editingMessageId === msg.id ? (
                            <div className="flex flex-col gap-2 min-w-[200px] bg-zinc-800 p-3 rounded-2xl border border-indigo-500 shadow-xl">
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
                            <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                              msg.senderId === user?.uid 
                                ? msgThemeObj.userBubbleClass 
                                : msg.isBot 
                                  ? msgThemeObj.botBubbleClass
                                  : msgThemeObj.charBubbleClass
                            }`}>
                              {/* Quoted Message */}
                              {msg.replyToId && (
                                <div className={`mb-2 p-2 rounded-lg text-xs border-l-4 ${
                                  msg.senderId === user?.uid 
                                    ? 'bg-indigo-700/50 border-indigo-400 text-indigo-100' 
                                    : 'bg-zinc-900/50 border-zinc-500 text-zinc-400'
                                }`}>
                                  <p className="font-bold opacity-75 mb-0.5">{msg.replyToSenderName}</p>
                                  <p className="truncate line-clamp-1">{msg.replyToContent}</p>
                                </div>
                              )}

                              {msg.imageUrl && (
                                <img 
                                  src={msg.imageUrl} 
                                  alt="" 
                                  className="rounded-lg mb-2 max-w-full h-auto border border-white/10" 
                                  referrerPolicy="no-referrer"
                                />
                              )}

                              {msg.fileUrl && (
                                <div className={`flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-white/10 mb-2 ${msg.senderId === user?.uid ? 'border-indigo-400/30' : ''}`}>
                                  <FileText className="w-8 h-8 text-zinc-500" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{msg.fileName}</p>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                                      {msg.fileType?.split('/')[1] || 'FILE'} • {Math.round(msg.fileSize! / 1024)} KB
                                    </p>
                                  </div>
                                  <a 
                                    href={msg.fileUrl} 
                                    download={msg.fileName}
                                    className="p-2 hover:bg-zinc-800 rounded-lg text-indigo-400 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                              {/* Reactions Display */}
                              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                <div className={`flex flex-wrap gap-1 mt-2 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                                  {Object.entries(msg.reactions).map(([emoji, uids]) => (
                                    <button
                                      key={emoji}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleReaction(msg.id, emoji);
                                      }}
                                      className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1.5 transition-all border ${
                                        uids.includes(user?.uid || '')
                                          ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/20'
                                          : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900'
                                      }`}
                                      title={uids.length > 1 ? `${uids.length} reactions` : ''}
                                    >
                                      <span className="scale-110">{emoji}</span>
                                      {uids.length > 1 && <span className="font-bold">{uids.length}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {msg.createdAt?.seconds && (
                                <div className={`text-[10px] mt-1 opacity-70 ${msg.senderId === user?.uid ? 'text-right' : ''}`}>
                                  {new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Toolbar on Hover */}
                        <div className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-full px-1 py-0.5 shadow-lg z-10 ${
                          msg.senderId === user?.uid ? 'right-full mr-2' : 'left-full ml-2'
                        }`}>
                          <button
                            onClick={() => {
                              setReplyTo(msg);
                              playSound('click');
                            }}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            title={t('messages.reply', 'Reply')}
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>

                          <div className="relative">
                            <button
                              onClick={() => {
                                setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id);
                                playSound('click');
                              }}
                              className={`p-1.5 rounded-full transition-colors ${
                                activeReactionPickerId === msg.id 
                                  ? 'bg-indigo-600 text-white' 
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                              }`}
                              title={t('messages.react', 'React')}
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            <AnimatePresence>
                              {activeReactionPickerId === msg.id && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 shadow-2xl flex items-center gap-2 z-50 min-w-[200px]"
                                >
                                  {['❤️', '👍', '😂', '😮', '😢', '🔥', '🎉', '🙏'].map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={() => {
                                        handleToggleReaction(msg.id, emoji);
                                        setActiveReactionPickerId(null);
                                      }}
                                      className="hover:scale-125 transition-transform text-lg"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          
                          {msg.senderId === user?.uid && !editingMessageId && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditContent(msg.content);
                                }}
                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                                title={t('common.edit')}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setMessageToDelete(msg.id)}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                                title={t('common.delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          
                          {msg.senderId !== user?.uid && isOwner && (
                            <button
                              onClick={() => setMessageToDelete(msg.id)}
                              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                              title="Delete (Admin)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {replyTo && (
              <div className="px-4 py-2 border-t border-indigo-500/30 bg-indigo-500/5 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex-1 min-w-0 border-l-2 border-indigo-500 pl-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{t('messages.replyingTo', 'Replying to')} {replyTo.senderName}</p>
                  <p className="text-sm text-zinc-400 truncate">{replyTo.content}</p>
                </div>
                <button 
                  onClick={() => setReplyTo(null)}
                  className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

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

            {selectedFile && (
              <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                    <FileText className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{Math.round(selectedFile.size / 1024)} KB</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {showEmojiPicker && (
              <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900 grid grid-cols-8 gap-2 animate-in fade-in slide-in-from-bottom-2">
                {['❤️', '👍', '😂', '😮', '😢', '🔥', '🎉', '🙏', '✨', '💯', '🤔', '👀', '✅', '❌', '🚀', '⭐'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setNewMessage(prev => prev + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="text-xl hover:scale-125 transition-transform p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-800 flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || isModerating}
                  className={`p-2 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-all disabled:opacity-50 ${msgThemeObj.accentTextClass}`}
                  title={t('messages.attach', 'Attach File')}
                >
                  {isModerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2 rounded-xl transition-all ${
                    showEmojiPicker ? msgThemeObj.buttonClass : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                  title={t('messages.emojis', 'Emojis')}
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t('messages.placeholder')}
                className={`flex-1 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all ${msgThemeObj.inputClass}`}
              />
              <button
                type="submit"
                disabled={(!newMessage.trim() && !selectedImage) || isSubmitting || isModerating}
                className={`p-2 rounded-xl disabled:opacity-50 transition-all flex items-center justify-center min-w-[40px] ${msgThemeObj.buttonClass}`}
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

      {/* Chat Info Sidebar */}
      <AnimatePresence>
        {isInfoOpen && activeChat && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-zinc-800 bg-zinc-900 overflow-hidden hidden lg:flex flex-col flex-shrink-0"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-white font-bold">{t('messages.chatInfo', 'Chat Info')}</h3>
              <button onClick={() => setIsInfoOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
              {/* Profile Card */}
              <div className="text-center space-y-3">
                <div className="relative mx-auto w-24 h-24">
                  {activeChat.type === 'group' ? (
                    <div className="w-24 h-24 rounded-full bg-indigo-500/10 flex items-center justify-center border-2 border-indigo-500/20">
                      <Users className="w-10 h-10 text-indigo-400" />
                    </div>
                  ) : activeChat.otherUser?.photoURL ? (
                    <img src={activeChat.otherUser.photoURL} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-zinc-700" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700">
                      <User className="w-10 h-10 text-zinc-500" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg">
                    {activeChat.type === 'group' ? activeChat.name : activeChat.otherUser?.displayName}
                  </h4>
                  <p className="text-zinc-500 text-xs">
                    {activeChat.type === 'group' ? `${activeChat.participants.length} ${t('common.members', 'Members')}` : t('messages.directChat')}
                  </p>
                </div>
              </div>

              {activeChat.type === 'direct' && activeChat.otherUser && (
                <div className="space-y-2">
                  <button
                    onClick={() => toggleBlockUser(activeChat.otherUser!.uid)}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all font-bold text-sm ${
                      profile?.blockedUsers?.includes(activeChat.otherUser.uid)
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {profile?.blockedUsers?.includes(activeChat.otherUser.uid) ? (
                      <><UserCheck className="w-4 h-4" /> {t('messages.unblock', 'Unblock User')}</>
                    ) : (
                      <><UserX className="w-4 h-4" /> {t('messages.block', 'Block User')}</>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-500 px-2 italic text-center">
                    {profile?.blockedUsers?.includes(activeChat.otherUser.uid) 
                      ? 'You have blocked this user. They cannot message you.' 
                      : 'Blocking prevents the user from messaging you directly.'}
                  </p>
                </div>
              )}

              {/* Members/Bots List */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('messages.participants', 'Participants')}</h5>
                <div className="space-y-2">
                  {activeChat.participants.map(pId => {
                    const info = activeChat.participantInfo?.[pId];
                    return (
                      <div key={pId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                        <img 
                          src={info?.photoURL || 'https://via.placeholder.com/32'} 
                          alt="" 
                          className="w-8 h-8 rounded-full object-cover border border-zinc-800" 
                        />
                        <span className="text-sm text-zinc-300 font-medium truncate">
                          {info?.displayName || 'User'}
                        </span>
                        {pId !== user?.uid && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(isBlocked(pId) ? 'Unblock this user?' : 'Block this user? They will not be able to send you messages.')) {
                                toggleBlockUser(pId);
                              }
                            }}
                            className={`ml-auto p-1.5 rounded-lg transition-colors ${
                              isBlocked(pId) 
                                ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white' 
                                : 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10'
                            }`}
                            title={isBlocked(pId) ? 'Unblock' : 'Block'}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {pId === user?.uid && <span className="text-[10px] text-zinc-600 ml-auto">(Me)</span>}
                      </div>
                    );
                  })}
                  {activeChat.characterIds?.map(botId => {
                    const bot = availableBots.find(b => b.id === botId);
                    if (!bot) return null;
                    return (
                      <div key={botId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                        <img src={bot.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-purple-500/30" />
                        <span className="text-sm text-purple-300 font-medium truncate">{bot.name}</span>
                        {activeChat.createdBy === user?.uid && (
                          <button
                            onClick={() => handleRemoveBot(botId)}
                            className="ml-auto p-1 text-zinc-600 hover:text-red-500 transition-colors"
                            title="Remove Bot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!activeChat.createdBy || activeChat.createdBy !== user?.uid && <Bot className="w-3 h-3 text-purple-400 ml-auto" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chat Actions */}
              <div className="pt-4 border-t border-zinc-800 space-y-2">
                <button
                  className="w-full p-2 text-left text-xs text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                  onClick={handleDeleteChat}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {activeChat.type === 'group' ? t('messages.leaveGroup', 'Leave Group') : t('messages.deleteChat', 'Delete Conversation')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <button onClick={() => { setIsCreateDirectOpen(false); setSearchQuery(''); }} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">{t('messages.selectUser')}</label>
                
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 no-scrollbar">
                  {availableUsers.filter(u => u.displayName.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                    <p className="text-center py-8 text-zinc-500 text-sm italic">{t('messages.noUsers')}</p>
                  ) : (
                    availableUsers.filter(u => u.displayName.toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
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
