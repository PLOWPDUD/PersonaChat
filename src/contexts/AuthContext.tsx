import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { LoadingScreen } from '../components/LoadingScreen';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isOwner: boolean;
  isModerator: boolean;
  updateProfile: (newProfile: any) => void;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true, 
  isOwner: false,
  isModerator: false,
  updateProfile: () => {},
  logOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.email === 'videosonli5@gmail.com' || profile?.role === 'owner';
  const isModerator = isOwner || profile?.role === 'moderator';

  const updateProfile = (newProfile: any) => {
    setProfile((prev: any) => ({ ...prev, ...newProfile }));
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
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const profileRef = doc(db, 'profiles', currentUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          const profileData = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || (currentUser.isAnonymous ? `Guest ${currentUser.uid.slice(0, 5)}` : 'Anonymous User'),
            photoURL: currentUser.photoURL || '',
            email: currentUser.email || '',
            updatedAt: serverTimestamp()
          };

          if (!profileSnap.exists()) {
            const newProfile = {
              ...profileData,
              displayName_lowercase: profileData.displayName.toLowerCase(),
              createdAt: serverTimestamp(),
              role: 'user'
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile);

            // Increment user count
            const statsRef = doc(db, 'siteStats', 'global');
            await setDoc(statsRef, { userCount: increment(1) }, { merge: true });
          } else {
            const data = profileSnap.data();
            // Migration: Ensure all required fields exist
            const needsUpdate = !data.displayName_lowercase || !data.email || !data.createdAt || !data.displayName || !data.uid;
            if (needsUpdate) {
              const updates: any = {
                uid: data.uid || profileData.uid,
                displayName: data.displayName || profileData.displayName,
                displayName_lowercase: (data.displayName || profileData.displayName).toLowerCase(),
                email: data.email || profileData.email
              };
              if (!data.createdAt) updates.createdAt = data.createdAt || serverTimestamp();
              
              await updateDoc(profileRef, updates);
              setProfile({ ...data, ...updates });
            } else {
              setProfile(data);
            }
          }

          // Increment visitor count on every session
          const statsRef = doc(db, 'siteStats', 'global');
          await setDoc(statsRef, { visitorCount: increment(1) }, { merge: true });

        } catch (error) {
          console.error('Error syncing profile:', error);
        }
      } else {
        setProfile(null);
      }
      
      // Small delay to prevent transient null states from triggering redirects
      setTimeout(() => {
        setLoading(false);
      }, 200);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOwner, isModerator, updateProfile, logOut }}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
};
