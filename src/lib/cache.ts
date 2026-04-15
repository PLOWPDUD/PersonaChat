// Global cache to reduce Firestore reads
export const profileCache: Record<string, { data: any, timestamp: number }> = {};
export let favoritesCache: { data: Set<string>, timestamp: number } | null = null;
export let userLikesCache: { data: Set<string>, timestamp: number } | null = null;
export let userSavesCache: { data: Set<string>, timestamp: number } | null = null;

const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

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
  favoritesCache = { data: favorites, timestamp: Date.now() };
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
  userLikesCache = { data: likes, timestamp: Date.now() };
};

export const getCachedUserSaves = () => {
  if (userSavesCache && (Date.now() - userSavesCache.timestamp) < CACHE_EXPIRY) {
    return userSavesCache.data;
  }
  return null;
};

export const setCachedUserSaves = (saves: Set<string>) => {
  userSavesCache = { data: saves, timestamp: Date.now() };
};
