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

  const isOwner = user?.email === 'videosonli5@gmail.com' || roles.isOwner || profile?.role === 'owner' || profile?.role === 'admin';
  const isModerator = isOwner || roles.isModerator || profile?.role === 'moderator';
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

  const logOut = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed:", currentUser ? `User logged in: ${currentUser.uid}` : "User logged out");
      setUser(currentUser);
      
      // Immediately grant owner/mod roles to the primary admin email
      if (currentUser?.email === 'videosonli5@gmail.com') {
        setRoles({ isOwner: true, isModerator: true });
      }
      
      if (currentUser) {
        // If we have a cached profile for this user, we can stop loading early
        if (profile && profile.uid === currentUser.uid) {
          setLoading(false);
        }

        // Skip if already synced recently (within 1 hour) to save quota
        const lastSync = localStorage.getItem(`profile_sync_time_${currentUser.uid}`);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        if (lastSync && (now - parseInt(lastSync)) < oneHour) {
          console.log("Profile already synced recently, skipping Firestore fetch");
          setLoading(false);
          return;
        }

        if (isSyncing.current || quotaExceeded) {
          setLoading(false);
          return;
        }

        isSyncing.current = true;

        try {
          const profileRef = doc(db, 'profiles', currentUser.uid);
          console.log("Fetching profile for:", currentUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          const profileData = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || (currentUser.isAnonymous ? `Guest ${currentUser.uid.slice(0, 5)}` : 'Anonymous User'),
            photoURL: currentUser.photoURL || '',
            email: currentUser.email || '',
            updatedAt: serverTimestamp()
          };

          if (!profileSnap.exists()) {
            console.log("No profile found, creating new one...");
            const newProfile = {
              ...profileData,
              displayName_lowercase: profileData.displayName.toLowerCase(),
              createdAt: serverTimestamp(),
              role: currentUser.email === 'videosonli5@gmail.com' ? 'owner' : 'user',
              hasSeenRules: false
            };
            await setDoc(profileRef, newProfile);
            console.log("New profile created");
            setProfile(newProfile);
            localStorage.setItem('cached_profile', JSON.stringify(newProfile));
            
            const newRoles = {
              isOwner: currentUser.email === 'videosonli5@gmail.com' || newProfile.role === 'owner' || newProfile.role === 'admin',
              isModerator: currentUser.email === 'videosonli5@gmail.com' || newProfile.role === 'owner' || newProfile.role === 'admin' || newProfile.role === 'moderator'
            };
            setRoles(newRoles);
            sessionStorage.setItem('cached_roles', JSON.stringify(newRoles));

            // Increment user count
            const statsRef = doc(db, 'siteStats', 'global');
            await setDoc(statsRef, { userCount: increment(1) }, { merge: true });
            console.log("User count incremented");
          } else {
            const data = profileSnap.data();
            console.log("Profile found:", data);
            
            // Only update if essential fields are missing or if the display name/photo has changed from Google
            const needsUpdate = !data.displayName_lowercase || !data.email || !data.createdAt || !data.displayName || !data.uid;
            const hasChanged = data.displayName !== profileData.displayName || data.photoURL !== profileData.photoURL;

            const isOwnerEmail = currentUser.email === 'videosonli5@gmail.com';
            const needsRoleUpgrade = isOwnerEmail && data.role !== 'owner' && data.role !== 'admin';

            if (needsUpdate || hasChanged || needsRoleUpgrade) {
              console.log("Profile needs update/migration or role upgrade");
              const updates: any = {
                uid: data.uid || profileData.uid,
                displayName: profileData.displayName,
                displayName_lowercase: profileData.displayName.toLowerCase(),
                photoURL: profileData.photoURL,
                email: data.email || profileData.email,
                updatedAt: serverTimestamp()
              };
              if (!data.createdAt) updates.createdAt = serverTimestamp();
              if (needsRoleUpgrade) updates.role = 'owner';
              
              await updateDoc(profileRef, updates);
              const updatedProfile = { ...data, ...updates };
              setProfile(updatedProfile);
              localStorage.setItem('cached_profile', JSON.stringify(updatedProfile));
            } else {
              setProfile(data);
              localStorage.setItem('cached_profile', JSON.stringify(data));
            }

            const newRoles = {
              isOwner: currentUser.email === 'videosonli5@gmail.com' || data.role === 'owner' || data.role === 'admin',
              isModerator: currentUser.email === 'videosonli5@gmail.com' || data.role === 'owner' || data.role === 'admin' || data.role === 'moderator'
            };
            setRoles(newRoles);
            sessionStorage.setItem('cached_roles', JSON.stringify(newRoles));
          }

          // Mark as synced with TTL
          localStorage.setItem(`profile_sync_time_${currentUser.uid}`, Date.now().toString());

          // Retroactive badge check
          checkAndAwardBadges(currentUser.uid);

          // Increment visitor count only once per 24 hours per device to save writes
          const lastIncrement = localStorage.getItem('last_visitor_increment');
          const nowTime = Date.now();
          const oneDay = 24 * 60 * 60 * 1000;
          
          if (!lastIncrement || (nowTime - parseInt(lastIncrement)) > oneDay) {
            const statsRef = doc(db, 'siteStats', 'global');
            await setDoc(statsRef, { visitorCount: increment(1) }, { merge: true });
            localStorage.setItem('last_visitor_increment', nowTime.toString());
            console.log("Visitor count incremented (once per 24h)");
          }

        } catch (error: any) {
          if (isQuotaError(error)) {
            setQuotaExceeded(true);
          }
          console.error('Error syncing profile:', error);
        } finally {
          isSyncing.current = false;
        }
      } else {
        setProfile(null);
        setRoles({ isOwner: false, isModerator: false });
        localStorage.removeItem('cached_profile');
        sessionStorage.removeItem('cached_roles');
      }
      
      // Small delay to prevent transient null states from triggering redirects
      setTimeout(() => {
        setLoading(false);
      }, 200);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOwner, isModerator, isBanned, quotaExceeded, setQuotaExceeded, updateProfile, updateSeenRules, logOut }}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
};
