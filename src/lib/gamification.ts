import { db } from './firebase';
import { doc, updateDoc, increment, addDoc, collection, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';

export const XP_PER_LEVEL = 1000;

export const calculateLevel = (xp: number) => {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
};

export const addXP = async (userId: string, amount: number) => {
  const userRef = doc(db, 'profiles', userId);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    const currentXp = userSnap.data().xp || 0;
    const newXp = currentXp + amount;
    const currentLevel = userSnap.data().level || 1;
    const newLevel = calculateLevel(newXp);
    
    const updates: any = {
      xp: increment(amount),
      updatedAt: serverTimestamp()
    };
    
    if (newLevel > currentLevel) {
      updates.level = newLevel;
      // Notify user of level up
      await addNotification(userId, 'level_up', 'Level Up!', `Congratulations! You've reached level ${newLevel}!`);
    }
    
    await updateDoc(userRef, updates);
  }
};

export const addNotification = async (userId: string, type: string, title: string, message: string, metadata: any = {}) => {
  await addDoc(collection(db, 'notifications'), {
    userId,
    type,
    title,
    message,
    read: false,
    createdAt: serverTimestamp(),
    ...metadata
  });
};

export const checkAchievement = async (userId: string, achievementId: string, name: string, description: string, icon: string, xpReward: number) => {
  const achievementRef = doc(db, 'users', userId, 'achievements', achievementId);
  const achievementSnap = await getDoc(achievementRef);
  
  if (!achievementSnap.exists()) {
    await setDoc(achievementRef, {
      earnedAt: serverTimestamp()
    });
    
    await addXP(userId, xpReward);
    await addNotification(userId, 'achievement_earned', 'Achievement Unlocked!', `You earned the "${name}" achievement!`, { achievementId, icon });
    return true;
  }
  return false;
};

export const ACHIEVEMENTS = {
  FIRST_POST: { id: 'first_post', name: 'First Words', description: 'Create your first community post', icon: '✍️', xp: 500 },
  FIRST_CHARACTER: { id: 'first_character', name: 'Creator', description: 'Create your first AI character', icon: '🤖', xp: 500 },
  FIRST_FOLLOW: { id: 'first_follow', name: 'Socialite', description: 'Follow your first user', icon: '🤝', xp: 200 },
  POPULAR_POST: { id: 'popular_post', name: 'Rising Star', description: 'Get 10 likes on a post', icon: '⭐', xp: 1000 },
  CHATTER_10: { id: 'chatter_10', name: 'Small Talk', description: 'Have your first conversation', icon: '💬', xp: 100 },
  CHATTER_100: { id: 'chatter_100', name: 'Chatterbox', description: 'Talk to 10 different characters', icon: '🗣️', xp: 1000 },
};

export const BADGES = [
  { id: 'early_adopter', name: 'Early Adopter', icon: '🚀', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  { id: 'verified', name: 'Verified', icon: '✅', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { id: 'creator', name: 'Pro Creator', icon: '🎨', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  { id: 'supporter', name: 'Supporter', icon: '💖', color: 'text-rose-400', bg: 'bg-rose-400/10' },
  { id: 'moderator', name: 'Guardian', icon: '🛡️', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { id: 'owner', name: 'Founder', icon: '👑', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
];
