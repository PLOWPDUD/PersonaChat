
export interface LocalCharacter {
  id: string;
  name: string;
  avatarUrl: string;
  greeting: string;
  description: string;
  personality: string;
  visibility: 'public' | 'private' | 'unlisted';
  category: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  interactionsCount: number;
  name_lowercase: string;
}

const CHARACTERS_KEY = 'local_private_characters';

export const getLocalCharacters = (): LocalCharacter[] => {
  try {
    const data = localStorage.getItem(CHARACTERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading local characters:', e);
    return [];
  }
};

export const saveLocalCharacter = (character: LocalCharacter) => {
  try {
    const characters = getLocalCharacters();
    const index = characters.findIndex(c => c.id === character.id);
    if (index !== -1) {
      characters[index] = character;
    } else {
      characters.push(character);
    }
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(characters));
  } catch (e) {
    console.error('Error saving local character:', e);
  }
};

export const deleteLocalCharacter = (id: string) => {
  try {
    const characters = getLocalCharacters();
    const filtered = characters.filter(c => c.id !== id);
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Error deleting local character:', e);
  }
};

export const getLocalCharacterById = (id: string): LocalCharacter | undefined => {
  return getLocalCharacters().find(c => c.id === id);
};

const CHATS_KEY = 'local_chats';

export interface LocalChat {
  id: string;
  userId: string;
  characterId: string;
  characterIds: string[];
  characterName: string;
  characterAvatarUrl: string;
  creatorName: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export const getLocalChats = (): LocalChat[] => {
  try {
    const data = localStorage.getItem(CHATS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading local chats:', e);
    return [];
  }
};

export const saveLocalChat = (chat: LocalChat) => {
  try {
    const chats = getLocalChats();
    const index = chats.findIndex(c => c.id === chat.id);
    if (index !== -1) {
      chats[index] = chat;
    } else {
      chats.push(chat);
    }
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch (e) {
    console.error('Error saving local chat:', e);
  }
};

export const getLocalChatById = (id: string): LocalChat | undefined => {
  return getLocalChats().find(c => c.id === id);
};

export const getLocalChatByCharacterId = (userId: string, characterId: string): LocalChat | undefined => {
  return getLocalChats().find(c => c.userId === userId && c.characterId === characterId);
};
