import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Character } from '../types';

/**
 * STRATEGY 1: Client-Side Cache for Public/Popular Bots
 * Fetches global public bots with a 10-minute client-side expiration to save reads.
 */
export async function getCachedPublicBots(): Promise<Character[]> {
  const CACHE_KEY = 'hub_characters';
  const CACHE_TIME_KEY = 'hub_characters_time';
  const CACHE_DURATION_MS = 600000; // 10 minutes (600,000 ms)

  const cachedData = localStorage.getItem(CACHE_KEY);
  const cacheTimestamp = localStorage.getItem(CACHE_TIME_KEY);

  const now = Date.now();
  
  if (cachedData && cacheTimestamp) {
    const age = now - parseInt(cacheTimestamp, 10);
    // If cache is fresh, return instantly
    if (age < CACHE_DURATION_MS) {
      return JSON.parse(cachedData) as Character[];
    }
  }

  // Cache expired or missing, fetch from Firestore
  try {
    const q = query(
      collection(db, 'characters'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
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
