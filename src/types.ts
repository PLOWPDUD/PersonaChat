export interface Profile {
  uid: string;
  displayName: string;
  photoURL: string;
  role?: string;
  email?: string;
  bannerURL?: string;
  themeColor?: string;
  userPersona?: string;
  personas?: any[];
  badges?: string[];
  level?: number;
  xp?: number;
  followersCount?: number;
  followingCount?: number;
}

export interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  description: string;
  creatorId: string;
  creatorName?: string;
  averageRating?: number;
  visibility: string;
  category?: string;
  greeting?: string;
  personality?: string;
  scenario?: string;
  exampleDialogue?: string;
  tags?: string[];
  interactionsCount?: number;
  likesCount?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'model';
  content: string;
  createdAt: any;
  characterId?: string;
  personaId?: string;
  imageUrl?: string;
}

export interface Chat {
  id: string;
  userId: string;
  characterId: string;
  characterIds?: string[];
  characterName: string;
  characterAvatarUrl: string;
  creatorName: string;
  lastMessage?: string;
  lastMessageAt?: any;
  createdAt: any;
  updatedAt: any;
  title?: string;
}
