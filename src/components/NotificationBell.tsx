import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, isQuotaError } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bell, X, Bot, ShieldAlert, ShieldCheck, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'character_banned' | 'character_reviewed' | 'new_character' | 'global';
  title: string;
  message: string;
  characterId?: string;
  read: boolean;
  createdAt: any;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    // 1. Listen for user-specific notifications
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userNotifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification));
      
      // 2. Fetch global notifications (one-time or periodic to save quota)
      fetchGlobalNotifications(userNotifs);
    }, (error) => {
      if (isQuotaError(error)) {
        console.warn("Quota exceeded for notifications");
      }
    });

    return () => unsubscribe();
  }, [user]);

  const fetchGlobalNotifications = async (userNotifs: Notification[]) => {
    try {
      const gq = query(
        collection(db, 'global_notifications'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const gSnap = await getDocs(gq);
      const globalNotifs = gSnap.docs.map(doc => {
        const data = doc.data();
        // Check if seen in localStorage
        const seenGlobal = JSON.parse(localStorage.getItem('seen_global_notifs') || '[]');
        return {
          id: doc.id,
          type: 'global',
          ...data,
          read: seenGlobal.includes(doc.id)
        } as Notification;
      });

      const allNotifs = [...userNotifs, ...globalNotifs].sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      setNotifications(allNotifs);
      setUnreadCount(allNotifs.filter(n => !n.read).length);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching global notifications:", error);
      setNotifications(userNotifs);
      setUnreadCount(userNotifs.filter(n => !n.read).length);
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (notif: Notification) => {
    if (notif.read) return;

    if (notif.type === 'global') {
      const seenGlobal = JSON.parse(localStorage.getItem('seen_global_notifs') || '[]');
      if (!seenGlobal.includes(notif.id)) {
        seenGlobal.push(notif.id);
        localStorage.setItem('seen_global_notifs', JSON.stringify(seenGlobal));
      }
    } else {
      try {
        await updateDoc(doc(db, 'notifications', notif.id), {
          read: true,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    }

    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotifClick = (notif: Notification) => {
    markAsRead(notif);
    if (notif.characterId) {
      navigate(`/chat/${notif.characterId}`);
    }
    setIsOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'character_banned': return <ShieldAlert className="w-5 h-5 text-red-500" />;
      case 'character_reviewed': return <ShieldCheck className="w-5 h-5 text-blue-500" />;
      case 'new_character': return <Bot className="w-5 h-5 text-indigo-500" />;
      default: return <Info className="w-5 h-5 text-zinc-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-zinc-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h3 className="font-bold text-white">Notifications</h3>
              <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
              ) : notifications.length > 0 ? (
                <div className="divide-y divide-zinc-800/50">
                  {notifications.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`w-full p-4 text-left hover:bg-zinc-800/50 transition-colors flex gap-4 ${!notif.read ? 'bg-indigo-500/5' : ''}`}
                    >
                      <div className="mt-1">{getIcon(notif.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className={`text-sm font-bold truncate ${!notif.read ? 'text-white' : 'text-zinc-300'}`}>
                            {notif.title}
                          </p>
                          {!notif.read && <span className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-zinc-600 mt-2 font-medium">
                          {notif.createdAt?.toDate ? new Date(notif.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Bell className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm">No notifications yet</p>
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 bg-zinc-900/50 border-t border-zinc-800 text-center">
                <button 
                  onClick={() => {
                    notifications.forEach(n => markAsRead(n));
                  }}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
