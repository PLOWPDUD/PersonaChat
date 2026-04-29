import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { showSystemNotification } from '../lib/notifications';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  characterId?: string;
  read: boolean;
  createdAt: any;
  userId?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotification: async () => {}
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, setQuotaExceeded } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoad = React.useRef(true);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const fetchNotifications = async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      
      try {
        // Fetch USER notifications
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        const snapshot = await getDocs(q);
        const userNotifs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Notification));

        // Background Check for system notifications (only if we have new unread ones)
        if (isBackground) {
           const prevUnreadIds = new Set(notifications.filter(n => !n.read).map(n => n.id));
           userNotifs.forEach(n => {
             if (!n.read && !prevUnreadIds.has(n.id)) {
               showSystemNotification(n.title, {
                 body: n.message,
                 tag: n.id,
                 icon: '/favicon.ico'
               });
             }
           });
        }

        // Fetch global notifications (cached locally for each user)
        const gq = query(
          collection(db, 'global_notifications'),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const gSnap = await getDocs(gq);
        const seenGlobal = JSON.parse(localStorage.getItem('seen_global_notifs') || '[]');
        const globalNotifs = gSnap.docs.map(doc => ({
          id: doc.id,
          type: 'global',
          ...doc.data(),
          read: seenGlobal.includes(doc.id)
        } as Notification));

        const merged = [...userNotifs, ...globalNotifs].sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        setNotifications(merged);
      } catch (err) {
        if (isQuotaError(err)) {
          console.warn("Notification sync hit quota.");
        } else {
          console.warn("Notifications fetch failed:", err);
        }
      } finally {
        if (!isBackground) setLoading(false);
      }
    };

    fetchNotifications();

    // Pull every 2 minutes instead of real-time connection
    const interval = setInterval(() => fetchNotifications(true), 120000);
    
    return () => clearInterval(interval);
  }, [user]);

  const markAsRead = async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (!notif || notif.read) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

    if (notif.type === 'global') {
      const seenGlobal = JSON.parse(localStorage.getItem('seen_global_notifs') || '[]');
      if (!seenGlobal.includes(id)) {
        seenGlobal.push(id);
        localStorage.setItem('seen_global_notifs', JSON.stringify(seenGlobal));
      }
    } else {
      try {
        await updateDoc(doc(db, 'notifications', id), {
          read: true,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
      }
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    const unreadIds = unread.map(n => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, read: true } : n));

    for (const notif of unread) {
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
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `notifications/${notif.id}`);
        }
      }
    }
  };

  const deleteNotification = async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (!notif || notif.type === 'global') return;

    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};
