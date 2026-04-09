import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, isQuotaError } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { LoadingScreen } from '../components/LoadingScreen';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isOwner: boolean;
  isModerator: boolean;
  quotaExceeded: boolean;
  becomeModerator: (password: string) => boolean;
  updateProfile: (newProfile: any) => void;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true, 
  isOwner: false,
  isModerator: false,
  quotaExceeded: false,
  becomeModerator: () => false,
  updateProfile: () => {},
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

  const isOwner = roles.isOwner;
  const isModerator = roles.isModerator;

  const becomeModerator = (password: string) => {
    const correctPassword = (import.meta as any).env.VITE_MODERATOR_PASSWORD || 'admin123';
    if (password === correctPassword) {
      const newRoles = { ...roles, isModerator: true };
      setRoles(newRoles);
      sessionStorage.setItem('cached_roles', JSON.stringify(newRoles));
      return true;
    }
    return false;
  };

  const updateProfile = (newProfile: any) => {
    setProfile((prev: any) => {
      const updated = { ...prev, ...newProfile };
      localStorage.setItem('cached_profile', JSON.stringify(updated));
      return updated;
    });
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
              role: 'user'
            };
            await setDoc(profileRef, newProfile);
            console.log("New profile created");
            setProfile(newProfile);
            localStorage.setItem('cached_profile', JSON.stringify(newProfile));
            
            const newRoles = {
              isOwner: currentUser.email === 'videosonli5@gmail.com' || newProfile.role === 'owner',
              isModerator: currentUser.email === 'videosonli5@gmail.com' || newProfile.role === 'owner' || newProfile.role === 'moderator'
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

            if (needsUpdate || hasChanged) {
              console.log("Profile needs update/migration or has changed");
              const updates: any = {
                uid: data.uid || profileData.uid,
                displayName: profileData.displayName,
                displayName_lowercase: profileData.displayName.toLowerCase(),
                photoURL: profileData.photoURL,
                email: data.email || profileData.email,
                updatedAt: serverTimestamp()
              };
              if (!data.createdAt) updates.createdAt = serverTimestamp();
              
              await updateDoc(profileRef, updates);
              const updatedProfile = { ...data, ...updates };
              setProfile(updatedProfile);
              localStorage.setItem('cached_profile', JSON.stringify(updatedProfile));
            } else {
              setProfile(data);
              localStorage.setItem('cached_profile', JSON.stringify(data));
            }

            const newRoles = {
              isOwner: currentUser.email === 'videosonli5@gmail.com' || data.role === 'owner',
              isModerator: currentUser.email === 'videosonli5@gmail.com' || data.role === 'owner' || data.role === 'moderator'
            };
            setRoles(newRoles);
            sessionStorage.setItem('cached_roles', JSON.stringify(newRoles));
          }

          // Mark as synced with TTL
          localStorage.setItem(`profile_sync_time_${currentUser.uid}`, Date.now().toString());

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
    <AuthContext.Provider value={{ user, profile, loading, isOwner, isModerator, quotaExceeded, becomeModerator, updateProfile, logOut }}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
};
