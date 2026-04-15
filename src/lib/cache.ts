// Global cache to reduce Firestore reads
export const profileCache: Record<string, { data: any, timestamp: number }> = {};
export let favoritesCache: { data: Set<string>, timestamp: number } | null = null;

const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

export const dataCache: Record<string, { data: any[], timestamp: number }> = {
  public: { data: [], timestamp: 0 },
  mine: { data: [], timestamp: 0 },
  recent: { data: [], timestamp: 0 },
  search_profiles: { data: [], timestamp: 0 },
  search_characters: { data: [], timestamp: 0 },
  community_posts: { data: [], timestamp: 0 }
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
};

export const clearDataCache = () => {
  Object.keys(dataCache).forEach(key => {
    dataCache[key] = { data: [], timestamp: 0 };
  });
};
