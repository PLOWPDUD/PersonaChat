import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Check, Trash2, Loader2, Award, UserPlus, Heart, MessageSquare, Mail, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { requestNotificationPermission, showSystemNotification, getNotificationSupport } from '../lib/notifications';
import { useTranslation } from 'react-i18next';

export function NotificationCenter() {
  const { t } = useTranslation();
  const { user, setQuotaExceeded } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  useEffect(() => {
    const checkSupport = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionGranted(Notification.permission === 'granted');
      }
    };
    checkSupport();
    window.addEventListener('focus', checkSupport);
    return () => window.removeEventListener('focus', checkSupport);
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Trigger system notifications if permitted and not initial load
      if (!isFirstLoad) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (!data.read) {
              showSystemNotification(data.title, {
                body: data.message,
                tag: change.doc.id, // Group by notification ID
                icon: '/favicon.ico'
              });
            }
          }
        });
      }

      setNotifications(newNotifications);
      setLoading(false);
      setIsFirstLoad(false);
    }, (error) => {
      if (isQuotaError(error)) {
        setQuotaExceeded(true);
      }
      console.error('Error fetching notifications:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, setQuotaExceeded, isFirstLoad]);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);
    if (granted) {
      showSystemNotification(t('notifications.enabledTitle'), { body: t('notifications.enabledBody') });
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), {
        read: true,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'achievement_earned': return <Award className="w-4 h-4 text-amber-500" />;
      case 'level_up': return <Zap className="w-4 h-4 text-amber-500" />;
      case 'new_follower': return <UserPlus className="w-4 h-4 text-indigo-500" />;
      case 'post_liked': return <Heart className="w-4 h-4 text-red-500" />;
      case 'new_comment': return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'new_message': return <Mail className="w-4 h-4 text-blue-500" />;
      default: return <Bell className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-zinc-400 hover:text-white transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 ltr:right-1 rtl:left-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-zinc-950">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute ltr:right-0 rtl:left-0 mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-white font-bold truncate">{t('notifications.title')}</h3>
                  {!permissionGranted && (
                    <button 
                      onClick={handleRequestPermission}
                      disabled={typeof window !== 'undefined' && !('Notification' in window)}
                      className="text-[9px] text-zinc-500 hover:text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left rtl:text-right"
                    >
                      {typeof window !== 'undefined' && 'Notification' in window 
                        ? t('notifications.enableAlerts') 
                        : t('notifications.noSupport')}
                    </button>
                  )}
                </div>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest shrink-0 ml-2 rtl:mr-2 rtl:ml-0">
                    {unreadCount} {t('notifications.new')}
                  </span>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto no-scrollbar">
                {loading ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-sm italic">
                    {t('notifications.empty')}
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 border-b border-zinc-800/50 flex gap-3 group transition-colors cursor-pointer ${n.read ? 'bg-transparent' : 'bg-indigo-500/5'}`}
                      onClick={() => !n.read && markAsRead(n.id)}
                    >
                      <div className={`mt-1 p-2 rounded-lg shrink-0 ${n.read ? 'bg-zinc-800' : 'bg-indigo-500/10'}`}>
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-white text-sm font-bold truncate ${n.read ? 'opacity-80' : ''}`}>{n.title}</p>
                        <p className="text-zinc-400 text-xs line-clamp-2 mt-0.5">{n.message}</p>
                        <p className="text-zinc-600 text-[10px] mt-1 space-x-2 rtl:space-x-reverse flex items-center gap-2">
                           <span>{n.createdAt?.toDate ? new Date(n.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</span>
                           {!n.read && <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0" />}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!n.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                            className="p-1 text-zinc-500 hover:text-green-500"
                            title={t('notifications.markAsRead')}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                          className="p-1 text-zinc-500 hover:text-red-500"
                          title={t('notifications.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
