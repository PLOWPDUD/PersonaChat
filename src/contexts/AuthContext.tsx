import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  updateProfile: (newProfile: any) => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, updateProfile: () => {} });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const updateProfile = (newProfile: any) => {
    setProfile((prev: any) => ({ ...prev, ...newProfile }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const profileRef = doc(db, 'profiles', currentUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          if (!profileSnap.exists()) {
            const displayName = currentUser.displayName || (currentUser.isAnonymous ? `Guest ${currentUser.uid.slice(0, 5)}` : 'Anonymous User');
            const newProfile = {
              uid: currentUser.uid,
              displayName: displayName,
              displayName_lowercase: displayName.toLowerCase(),
              photoURL: currentUser.photoURL || '',
              createdAt: serverTimestamp()
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile);
          } else {
            const data = profileSnap.data();
            setProfile(data);
          }
        } catch (error) {
          console.error('Error syncing profile:', error);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, updateProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
