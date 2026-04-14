export const playSound = (type: 'like' | 'click' | 'success' | 'levelUp') => {
  const sounds = {
    like: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
    click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    success: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
    levelUp: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
  };
  
  const audio = new Audio(sounds[type]);
  audio.volume = 0.5;
  audio.play().catch(() => {}); // Ignore errors if browser blocks autoplay
};
