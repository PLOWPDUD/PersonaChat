import { db } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  serverTimestamp, 
  arrayUnion,
  query,
  where,
  getDocs
} from 'firebase/firestore';

export interface Badge {
  id: string;
  label: string;
  threshold: number;
  icon: string;
  description: string;
}

export const BADGES: Badge[] = [
  { 
    id: 'first_interaction', 
    label: 'First Interaction', 
    threshold: 1, 
    icon: '🌟',
    description: 'Your public character was first interacted by someone!'
  },
  { 
    id: '10_interactions', 
    label: '10th Interaction', 
    threshold: 10, 
    icon: '🔥',
    description: 'Your public characters reached 10 total interactions!'
  },
  { 
    id: '50_interactions', 
    label: '50 Interactions', 
    threshold: 50, 
    icon: '💎',
    description: 'Your public characters reached 50 total interactions!'
  },
  { 
    id: '100_interactions', 
    label: '100+ Interactions', 
    threshold: 100, 
    icon: '👑',
    description: 'Your public characters reached 100 or more interactions!'
  },
];

export async function checkAndAwardBadges(userId: string) {
  try {
    const profileRef = doc(db, 'profiles', userId);
    const profileSnap = await getDoc(profileRef);
    
    if (!profileSnap.exists()) return;
    
    const profileData = profileSnap.data();
    const currentBadges = profileData.badges || [];
    
    // Calculate total interactions across all public characters
    const charactersRef = collection(db, 'characters');
    const q = query(
      charactersRef, 
      where('creatorId', '==', userId),
      where('visibility', '==', 'public')
    );
    
    const charSnap = await getDocs(q);
    let totalInteractions = 0;
    charSnap.forEach(doc => {
      totalInteractions += (doc.data().interactionsCount || 0);
    });
    
    const newBadges: string[] = [];
    
    for (const badge of BADGES) {
      if (totalInteractions >= badge.threshold && !currentBadges.includes(badge.id)) {
        newBadges.push(badge.id);
      }
    }
    
    if (newBadges.length > 0) {
      // Award badges
      await updateDoc(profileRef, {
        badges: arrayUnion(...newBadges)
      });
      
      // Send notifications
      for (const badgeId of newBadges) {
        const badge = BADGES.find(b => b.id === badgeId);
        if (badge) {
          await addDoc(collection(db, 'notifications'), {
            userId,
            type: 'badge_earned',
            title: `New Badge Earned: ${badge.label} ${badge.icon}`,
            message: badge.description,
            badgeId: badge.id,
            read: false,
            createdAt: serverTimestamp()
          });
        }
      }
      
      return newBadges;
    }
    
    return [];
  } catch (error) {
    console.error("Error checking/awarding badges:", error);
    return [];
  }
}
