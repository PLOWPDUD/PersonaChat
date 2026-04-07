// Global cache to reduce Supabase reads
export const profileCache: Record<string, string> = {};
export const fullProfileCache: Record<string, any> = {};
export let favoritesCache: Set<string> | null = null;

export const dataCache: Record<string, any[]> = {
  public: [],
  mine: [],
  recent: []
};

export const getCachedProfile = (uid: string) => profileCache[uid];
export const getCachedFullProfile = (uid: string) => fullProfileCache[uid];

export const setCachedProfile = (uid: string, displayName: string) => {
  profileCache[uid] = displayName;
};

export const setCachedFullProfile = (uid: string, profile: any) => {
  fullProfileCache[uid] = profile;
};

export const setCachedProfiles = (profiles: Record<string, string>) => {
  Object.assign(profileCache, profiles);
};

export const getCachedFavorites = () => favoritesCache;

export const setCachedFavorites = (favorites: Set<string>) => {
  favoritesCache = favorites;
};

export const clearFavoritesCache = () => {
  favoritesCache = null;
};

export const getCachedData = (key: string) => dataCache[key];

export const updateGlobalCache = (key: string, data: any[]) => {
  dataCache[key] = data;
};

export const clearDataCache = () => {
  dataCache.public = [];
  dataCache.mine = [];
  dataCache.recent = [];
};
