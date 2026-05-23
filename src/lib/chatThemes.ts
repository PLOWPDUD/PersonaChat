export interface ChatTheme {
  id: string;
  name: string;
  category: 'solid' | 'gradient' | 'themed' | 'cyber';
  emoji: string;
  description: string;
  backdropClass: string;
  userBubbleClass: string;
  charBubbleClass: string;
  botBubbleClass: string;
  inputClass: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'default',
    name: 'Theme Accent',
    category: 'solid',
    emoji: '✨',
    description: 'Matches the application\'s global accent theme.',
    backdropClass: 'bg-zinc-950/40',
    userBubbleClass: 'bg-theme-primary text-white rounded-tr-none shadow-md shadow-theme-primary/10',
    charBubbleClass: 'bg-zinc-900/90 border border-zinc-800 text-zinc-150 text-zinc-100 rounded-tl-none backdrop-blur-md',
    botBubbleClass: 'bg-purple-900/10 border border-purple-500/20 text-purple-200 rounded-tl-none backdrop-blur-md',
    inputClass: 'bg-zinc-900/80 border-zinc-805 border-zinc-800 focus:border-theme-primary'
  },
  {
    id: 'cosmic',
    name: 'Cosmic Space',
    category: 'gradient',
    emoji: '🌌',
    description: 'A deep space nebula with fuchsia and violet notes.',
    backdropClass: 'bg-gradient-to-b from-purple-950/20 via-zinc-950 to-zinc-950 bg-zinc-950/45',
    userBubbleClass: 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-tr-none border border-purple-500/30 shadow-lg shadow-purple-950/30',
    charBubbleClass: 'bg-zinc-900/95 border border-purple-500/20 text-purple-100 rounded-tl-none backdrop-blur-md',
    botBubbleClass: 'bg-purple-950/35 border border-purple-500/35 text-pink-200 rounded-tl-none backdrop-blur-md',
    inputClass: 'bg-zinc-900/90 border-purple-800/30 focus:border-purple-500'
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    category: 'themed',
    emoji: '🌲',
    description: 'Calming green canopy with deep botanical shades.',
    backdropClass: 'bg-gradient-to-b from-emerald-950/15 via-zinc-950 to-zinc-950 bg-zinc-950/45',
    userBubbleClass: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-none border border-emerald-500/30 shadow-lg shadow-emerald-950/30',
    charBubbleClass: 'bg-zinc-900/95 border border-emerald-500/20 text-emerald-100 rounded-tl-none backdrop-blur-md',
    botBubbleClass: 'bg-teal-950/35 border border-teal-500/35 text-medium-emerald text-emerald-205 rounded-tl-none backdrop-blur-md text-emerald-200',
    inputClass: 'bg-zinc-900/90 border-emerald-800/30 focus:border-emerald-500'
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    category: 'gradient',
    emoji: '🌅',
    description: 'Vibrant sunset shades of warm amber and orange.',
    backdropClass: 'bg-gradient-to-b from-red-950/15 via-zinc-950 to-zinc-950 bg-zinc-950/45',
    userBubbleClass: 'bg-gradient-to-r from-amber-500 to-red-650 bg-gradient-to-r from-amber-500 to-red-600 text-white rounded-tr-none border border-amber-500/30 shadow-lg shadow-amber-950/20',
    charBubbleClass: 'bg-zinc-900/95 border border-amber-500/20 text-amber-100 rounded-tl-none backdrop-blur-md',
    botBubbleClass: 'bg-orange-950/30 border border-orange-500/30 text-amber-200 rounded-tl-none backdrop-blur-md',
    inputClass: 'bg-zinc-900/90 border-amber-850 border-amber-800/30 focus:border-amber-500'
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    category: 'themed',
    emoji: '🌊',
    description: 'Abyssal depths of marine blues and seafoam teal.',
    backdropClass: 'bg-gradient-to-b from-blue-950/20 via-zinc-950 to-zinc-950 bg-zinc-950/45',
    userBubbleClass: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-tr-none border border-cyan-500/30 shadow-lg shadow-cyan-950/20',
    charBubbleClass: 'bg-zinc-900/95 border border-blue-500/20 text-blue-100 rounded-tl-none backdrop-blur-md',
    botBubbleClass: 'bg-cyan-950/35 border border-cyan-500/35 text-cyan-200 rounded-tl-none backdrop-blur-md',
    inputClass: 'bg-zinc-900/90 border-blue-800/30 focus:border-blue-500'
  },
  {
    id: 'hacker',
    name: 'Cyber Terminal',
    category: 'cyber',
    emoji: '📟',
    description: 'Glowing green monospace retro computer vibes.',
    backdropClass: 'bg-[radial-gradient(#15803d15_1px,transparent_1px)] bg-[size:16px_16px] bg-zinc-950/90 border-t border-zinc-900',
    userBubbleClass: 'bg-green-600/25 border border-green-500/50 text-green-300 rounded-tr-none font-mono text-sm shadow-md shadow-green-950/20',
    charBubbleClass: 'bg-zinc-950/95 border border-green-500/20 text-green-400/90 rounded-tl-none font-mono text-sm shadow-md',
    botBubbleClass: 'bg-zinc-950/90 border border-cyan-500/20 text-cyan-400 rounded-tl-none font-mono text-sm',
    inputClass: 'bg-black border-green-900/50 text-green-400 font-mono focus:border-green-500'
  },
  {
    id: 'slate',
    name: 'Minimal Slate',
    category: 'solid',
    emoji: '🖤',
    description: 'Clean, flat shades of charcoal, black, and pure white.',
    backdropClass: 'bg-zinc-950 border-t border-zinc-900',
    userBubbleClass: 'bg-zinc-100 hover:bg-white text-zinc-900 rounded-tr-none shadow-sm font-medium',
    charBubbleClass: 'bg-zinc-900/90 border border-zinc-800 text-zinc-300 rounded-tl-none',
    botBubbleClass: 'bg-zinc-900/90 border border-zinc-800 text-zinc-400 rounded-tl-none',
    inputClass: 'bg-zinc-900/70 border-zinc-800 focus:border-zinc-650 focus:border-zinc-700'
  }
];

export function getChatTheme(themeId?: string): ChatTheme {
  return CHAT_THEMES.find(t => t.id === themeId) || CHAT_THEMES[0];
}
