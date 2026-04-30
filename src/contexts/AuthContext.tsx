import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, isQuotaError } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { LoadingScreen } from '../components/LoadingScreen';
import { checkAndAwardBadges } from '../services/badgeService';
import { setCachedProfile } from '../lib/cache';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isOwner: boolean;
  isModerator: boolean;
  isBanned: boolean;
  quotaExceeded: boolean;
  setQuotaExceeded: (exceeded: boolean) => void;
  updateProfile: (newProfile: any) => Promise<void>;
  updateSeenRules: () => Promise<void>;
  toggleBlockUser: (targetId: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true, 
  isOwner: false,
  isModerator: false,
  isBanned: false,
  quotaExceeded: false,
  setQuotaExceeded: () => {},
  updateProfile: async () => {},
  updateSeenRules: async () => {},
  toggleBlockUser: async () => {},
  logOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(() => {
    const cached = localStorage.getItem('cached_profile');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const isSyncing = useRef(false);

  // Use sessionStorage to cache roles for the session
  const [roles, setRoles] = useState<{ isOwner: boolean; isModerator: boolean }> (() => {
    const cached = sessionStorage.getItem('cached_roles');
    return cached ? JSON.parse(cached) : { isOwner: false, isModerator: false };
  });

  const isOwner = user?.email === 'videosonli5@gmail.com';
  const isModerator = isOwner || roles.isModerator || profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'moderator';
  const isBanned = !!profile?.isBanned && (!profile.banExpiresAt || new Date(profile.banExpiresAt.toDate()) > new Date());

  const updateProfile = async (newProfile: any) => {
    if (!user) return;

    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const updates = { ...newProfile, updatedAt: serverTimestamp() };
      
      if (newProfile.displayName) {
        updates.displayName_lowercase = newProfile.displayName.toLowerCase();
      }
      
      await updateDoc(profileRef, updates);
      
      const updatedProfile = { ...profile, ...newProfile };
      setCachedProfile(user.uid, updatedProfile);
      
      setProfile((prev: any) => {
        const updated = { ...prev, ...newProfile };
        localStorage.setItem('cached_profile', JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  const updateSeenRules = async () => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, { 
        hasSeenRules: true,
        updatedAt: serverTimestamp() 
      });
      
      setProfile((prev: any) => {
        const updated = { ...prev, hasSeenRules: true };
        localStorage.setItem('cached_profile', JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const toggleBlockUser = async (targetId: string) => {
    if (!user || !profile) return;
    
    const blockedUsers = profile.blockedUsers || [];
    const isBlocked = blockedUsers.includes(targetId);
    
    const newBlockedUsers = isBlocked 
      ? blockedUsers.filter((id: string) => id !== targetId)
      : [...blockedUsers, targetId];
      
    await updateProfile({ blockedUsers: newBlockedUsers });
  };

  const logOut = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const trackVisitor = async () => {
      const lastIncrement = localStorage.getItem('last_visitor_increment');
      const nowTime = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      if (!lastIncrement || (nowTime - parseInt(lastIncrement)) > oneDay) {
        try {
          const statsRef = doc(db, 'siteStats', 'global');
          await setDoc(statsRef, { 
            visitorCount: increment(1),
            updatedAt: serverTimestamp()
          }, { merge: true });
          localStorage.setItem('last_visitor_increment', nowTime.toString());
        } catch (error) {
          console.warn("Could not increment visitor count:", error);
        }
      }
    };
    trackVisitor();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const googleProviderData = currentUser.providerData.find(p => p.providerId === 'google.com');
        
        if (currentUser?.email === 'videosonli5@gmail.com') {
          setRoles({ isOwner: true, isModerator: true });
        }

        if (profile && profile.uid === currentUser.uid) {
          setLoading(false);
        }

        const lastSync = localStorage.getItem(`profile_sync_time_${currentUser.uid}`);
        const now = Date.now();
        const syncThreshold = 10 * 60 * 1000; 
        
        if (lastSync && (now - parseInt(lastSync)) < syncThreshold) {
          setLoading(false);
          return;
        }

        if (isSyncing.current || (quotaExceeded && !profile)) {
          setLoading(false);
          return;
        }

        isSyncing.current = true;

        const syncTimeout = setTimeout(async () => {
          try {
          const profileRef = doc(db, 'profiles', currentUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          const fallBackName = currentUser.isAnonymous 
            ? `Guest ${currentUser.uid.slice(0, 5)}` 
            : (currentUser.email ? currentUser.email.split('@')[0] : 'Persona User');

          const profileData = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || googleProviderData?.displayName || fallBackName,
            photoURL: currentUser.photoURL || googleProviderData?.photoURL || '',
            email: currentUser.email || googleProviderData?.email || '',
            updatedAt: serverTimestamp()
          };

          if (!profileSnap.exists()) {
            const newProfile = {
              ...profileData,
              displayName_lowercase: profileData.displayName.toLowerCase(),
              createdAt: serverTimestamp(),
              role: currentUser.email === 'videosonli5@gmail.com' ? 'owner' : 'user',
              hasSeenRules: false,
              isCounted: true,
              blockedUsers: []
            };
            await setDoc(profileRef, newProfile);
            
            const localProfile = { ...newProfile, updatedAt: new Date(), createdAt: new Date() };
            setProfile(localProfile);
            localStorage.setItem('cached_profile', JSON.stringify(localProfile));
            
            const newRoles = {
              isOwner: currentUser.email === 'videosonli5@gmail.com',
              isModerator: currentUser.email === 'videosonli5@gmail.com' || newProfile.role === 'owner' || newProfile.role === 'admin' || newProfile.role === 'moderator'
            };
            setRoles(newRoles);
            sessionStorage.setItem('cached_roles', JSON.stringify(newRoles));

            try {
              const statsRef = doc(db, 'siteStats', 'global');
              await setDoc(statsRef, { userCount: increment(1) }, { merge: true });
            } catch (statsErr) {
              console.warn("Failed to increment user count:", statsErr);
            }
          } else {
            const data = profileSnap.data();
            const needsUpdate = !data.displayName_lowercase || !data.email || !data.createdAt || !data.displayName || !data.uid || !data.blockedUsers;
            const needsCount = !data.isCounted && !currentUser.isAnonymous;
            const isGenericName = data.displayName === 'Anonymous User' || data.displayName === 'Persona User' || data.displayName.startsWith('Guest ');
            const hasGoogleNameNow = currentUser.displayName && isGenericName;
            
            const hasChanged = hasGoogleNameNow || 
                               (currentUser.displayName && data.displayName !== currentUser.displayName) || 
                               (currentUser.photoURL && data.photoURL !== currentUser.photoURL) ||
                               (currentUser.email && data.email !== currentUser.email) ||
                               needsCount;

            const isOwnerEmail = currentUser.email === 'videosonli5@gmail.com';
            const needsRoleUpgrade = isOwnerEmail && data.role !== 'owner' && data.role !== 'admin';

            if (needsUpdate || hasChanged || needsRoleUpgrade) {
              const updates: any = {
                uid: data.uid || profileData.uid,
                displayName: currentUser.displayName || data.displayName || fallBackName,
                displayName_lowercase: (currentUser.displayName || data.displayName || fallBackName).toLowerCase(),
                photoURL: currentUser.photoURL || data.photoURL || '',
                email: data.email || currentUser.email || '',
                updatedAt: serverTimestamp()
              };
              if (!data.createdAt) updates.createdAt = serverTimestamp();
              if (needsRoleUpgrade) updates.role = 'owner';
              if (needsCount) updates.isCounted = true;
              if (!data.blockedUsers) updates.blockedUsers = [];
              
              await updateDoc(profileRef, updates);
              
              if (needsCount) {
                try {
                  const statsRef = doc(db, 'siteStats', 'global');
                  await setDoc(statsRef, { userCount: increment(1) }, { merge: true });
                } catch (statsErr) {
                  console.warn("Failed to increment user count:", statsErr);
                }
              }

              const updatedProfile = { ...data, ...updates, updatedAt: new Date() };
              setProfile(updatedProfile);
              localStorage.setItem('cached_profile', JSON.stringify(updatedProfile));
            } else {
              setProfile(data);
              localStorage.setItem('cached_profile', JSON.stringify(data));
            }

            const newRoles = {
              isOwner: currentUser.email === 'videosonli5@gmail.com',
              isModerator: currentUser.email === 'videosonli5@gmail.com' || data.role === 'owner' || data.role === 'admin' || data.role === 'moderator'
            };
            setRoles(newRoles);
            sessionStorage.setItem('cached_roles', JSON.stringify(newRoles));
          }

          localStorage.setItem(`profile_sync_time_${currentUser.uid}`, Date.now().toString());
          checkAndAwardBadges(currentUser.uid);

        } catch (error: any) {
          if (isQuotaError(error)) {
            if (!profile) {
              setQuotaExceeded(true);
            }
          }
          console.error('Error syncing profile:', error);
        } finally {
          isSyncing.current = false;
        }
      }, 1500);

      return () => clearTimeout(syncTimeout);
    } else {
        setProfile(null);
        setRoles({ isOwner: false, isModerator: false });
        localStorage.removeItem('cached_profile');
        sessionStorage.removeItem('cached_roles');
      }
      
      setTimeout(() => {
        setLoading(false);
      }, 200);
    });

    return () => unsubscribe();
  }, [profile]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isOwner, 
      isModerator, 
      isBanned, 
      quotaExceeded, 
      setQuotaExceeded, 
      updateProfile, 
      updateSeenRules, 
      toggleBlockUser,
      logOut 
    }}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
};
