import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Character } from '../types';

/**
 * STRATEGY 1: Client-Side Cache for Public/Popular Bots
 * Fetches global public bots exactly ONCE every 24 hours.
 */
export async function getCachedPublicBots(): Promise<Character[]> {
  const CACHE_KEY = 'global_public_bots_cache';
  const CACHE_TIME_KEY = 'global_public_bots_timestamp';
  const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  const cachedData = localStorage.getItem(CACHE_KEY);
  const cacheTimestamp = localStorage.getItem(CACHE_TIME_KEY);

  const now = Date.now();
  
  if (cachedData && cacheTimestamp) {
    const age = now - parseInt(cacheTimestamp, 10);
    // If cache is less than 24 hours old, return instantly (0 reads!)
    if (age < CACHE_DURATION_MS) {
      return JSON.parse(cachedData) as Character[];
    }
  }

  // Cache expired or missing, fetch from Firestore
  try {
    const q = query(
      collection(db, 'characters'),
      where('isPublic', '==', true),
      orderBy('usersCount', 'desc'), // Or however you sort popular bots
      limit(20)
    );
    const snapshot = await getDocs(q);
    const bots: Character[] = [];
    
    snapshot.forEach((doc) => {
      // Safely serialize for localStorage
      const data = doc.data();
      bots.push({ 
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
      } as unknown as Character);
    });

    // Refresh cache and update timestamp
    localStorage.setItem(CACHE_KEY, JSON.stringify(bots));
    localStorage.setItem(CACHE_TIME_KEY, now.toString());

    return bots;
  } catch (error) {
    console.error('Failed to fetch public bots:', error);
    // Fallback to stale cache if DB quota is exceeded to maintain uptime
    if (cachedData) {
      return JSON.parse(cachedData) as Character[];
    }
    return [];
  }
}
