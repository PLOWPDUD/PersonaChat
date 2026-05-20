// Global cache to reduce Firestore reads
const loadProfileCache = () => {
  try {
    const stored = localStorage.getItem('profile_cache');
    if (stored) {
      const parsed = JSON.parse(stored);
      const now = Date.now();
      // Clean up expired profiles
      const cleaned: Record<string, { data: any, timestamp: number }> = {};
      Object.entries(parsed).forEach(([uid, entry]: [string, any]) => {
        if (now - entry.timestamp < 24 * 60 * 60 * 1000) { // Keep for 24 hours
          cleaned[uid] = entry;
        }
      });
      return cleaned;
    }
  } catch (e) {
    console.error("Failed to load profile cache", e);
  }
  return {};
};

export const profileCache: Record<string, { data: any, timestamp: number }> = loadProfileCache();

const saveProfileCache = () => {
  try {
    localStorage.setItem('profile_cache', JSON.stringify(profileCache));
  } catch (e) {
    console.error("Failed to save profile cache", e);
  }
};

export let favoritesCache: { data: Set<string>, timestamp: number } | null = null;
export let userLikesCache: { data: Set<string>, timestamp: number } | null = null;
export let userSavesCache: { data: Set<string>, timestamp: number } | null = null;

const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Helper to save Set to localStorage
const saveSetToLocal = (key: string, data: Set<string>, timestamp: number) => {
  try {
    localStorage.setItem(key, JSON.stringify({ data: Array.from(data), timestamp }));
  } catch (e) {
    console.error(`Failed to save ${key} to local storage`, e);
  }
};

// Helper to load Set from localStorage
const loadSetFromLocal = (key: string) => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < CACHE_EXPIRY) {
        return { data: new Set<string>(parsed.data), timestamp: parsed.timestamp };
      }
    }
  } catch (e) {
    console.error(`Failed to load ${key} from local storage`, e);
  }
  return null;
};

// Load initial caches
favoritesCache = loadSetFromLocal('user_favorites_cache');
userLikesCache = loadSetFromLocal('user_likes_cache');
userSavesCache = loadSetFromLocal('user_saves_cache');

// Load initial dataCache from localStorage if available
const loadDataCache = () => {
  try {
    const stored = localStorage.getItem('global_data_cache');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate timestamps
      const now = Date.now();
      Object.keys(parsed).forEach(key => {
        if (now - parsed[key].timestamp > CACHE_EXPIRY) {
          parsed[key] = { data: [], timestamp: 0 };
        }
      });
      return parsed;
    }
  } catch (e) {
    console.error("Failed to load data cache from local storage", e);
  }
  return {
    public: { data: [], timestamp: 0 },
    mine: { data: [], timestamp: 0 },
    recent: { data: [], timestamp: 0 },
    search_profiles: { data: [], timestamp: 0 },
    search_characters: { data: [], timestamp: 0 },
    community_posts: { data: [], timestamp: 0 },
    trending_posts: { data: [], timestamp: 0 }
  };
};

export const dataCache: Record<string, { data: any[], timestamp: number }> = loadDataCache();

const saveDataCache = () => {
  try {
    localStorage.setItem('global_data_cache', JSON.stringify(dataCache));
  } catch (e) {
    console.error("Failed to save data cache to local storage", e);
  }
};

export const getCachedProfile = (uid: string) => {
  const cached = profileCache[uid];
  if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
    return cached.data;
  }
  return null;
};

export const setCachedProfile = (uid: string, profile: any) => {
  profileCache[uid] = { data: profile, timestamp: Date.now() };
  saveProfileCache();
};

export const setCachedProfiles = (profiles: Record<string, any>) => {
  Object.entries(profiles).forEach(([uid, profile]) => {
    setCachedProfile(uid, profile);
  });
};

export const getCachedFavorites = () => {
  if (favoritesCache && (Date.now() - favoritesCache.timestamp) < CACHE_EXPIRY) {
    return favoritesCache.data;
  }
  return null;
};

export const setCachedFavorites = (favorites: Set<string>) => {
  const now = Date.now();
  favoritesCache = { data: favorites, timestamp: now };
  saveSetToLocal('user_favorites_cache', favorites, now);
};

export const clearFavoritesCache = () => {
  favoritesCache = null;
};

export const getCachedData = (key: string) => {
  const cached = dataCache[key];
  if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
    return cached.data;
  }
  return null;
};

export const updateGlobalCache = (key: string, data: any[]) => {
  dataCache[key] = { data, timestamp: Date.now() };
  saveDataCache();
};

export const incrementCachedCharacterInteraction = (characterId: string) => {
  // Update characters in global data cache
  Object.keys(dataCache).forEach(key => {
    if (dataCache[key] && dataCache[key].data) {
      const charArray = dataCache[key].data;
      const index = charArray.findIndex((c: any) => c.id === characterId);
      if (index !== -1) {
        charArray[index].interactionsCount = (charArray[index].interactionsCount || 0) + 1;
      }
    }
  });
  saveDataCache();
  
  // also update the standalone cached_public_characters item if it exists
  try {
    const cachedPublic = localStorage.getItem('cached_public_characters');
    if (cachedPublic) {
      const parsed = JSON.parse(cachedPublic);
      const index = parsed.findIndex((c: any) => c.id === characterId);
      if (index !== -1) {
        parsed[index].interactionsCount = (parsed[index].interactionsCount || 0) + 1;
        localStorage.setItem('cached_public_characters', JSON.stringify(parsed));
      }
    }
  } catch (e) {
    // ignore parsing errors
  }
};

export const clearDataCache = () => {
  Object.keys(dataCache).forEach(key => {
    dataCache[key] = { data: [], timestamp: 0 };
  });
  saveDataCache();
};

export const getCachedUserLikes = () => {
  if (userLikesCache && (Date.now() - userLikesCache.timestamp) < CACHE_EXPIRY) {
    return userLikesCache.data;
  }
  return null;
};

export const setCachedUserLikes = (likes: Set<string>) => {
  const now = Date.now();
  userLikesCache = { data: likes, timestamp: now };
  saveSetToLocal('user_likes_cache', likes, now);
};

export const getCachedUserSaves = () => {
  if (userSavesCache && (Date.now() - userSavesCache.timestamp) < CACHE_EXPIRY) {
    return userSavesCache.data;
  }
  return null;
};

export const setCachedUserSaves = (saves: Set<string>) => {
  const now = Date.now();
  userSavesCache = { data: saves, timestamp: now };
  saveSetToLocal('user_saves_cache', saves, now);
};
