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

    // Single listener for all USER notifications
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userNotifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification));

      // Fetch global notifications (cached locally for each user)
      const fetchGlobal = async () => {
        try {
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

          setNotifications(prev => {
            const merged = [...userNotifs, ...globalNotifs].sort((a, b) => {
              const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
              const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
              return timeB - timeA;
            });
            return merged;
          });
        } catch (err) {
          console.warn("Global notifications fetch failed:", err);
        }
      };

      if (isFirstLoad.current) {
        fetchGlobal();
        isFirstLoad.current = false;
      } else {
        // Handle new notification alerts
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (!data.read) {
              showSystemNotification(data.title, {
                body: data.message,
                tag: change.doc.id,
                icon: '/favicon.ico'
              });
            }
          }
        });
        
        setNotifications(prev => {
           const globalNotifs = prev.filter(n => n.type === 'global');
           return [...userNotifs, ...globalNotifs].sort((a, b) => {
              const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
              const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
              return timeB - timeA;
           });
        });
      }

      setLoading(false);
    }, (error) => {
      if (isQuotaError(error)) {
        console.warn("Notification syncing hit quota, but proceeding silently.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, setQuotaExceeded]);

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
