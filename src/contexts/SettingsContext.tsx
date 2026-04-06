import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeColor = 'indigo' | 'purple' | 'blue' | 'green' | 'red' | 'pink' | 'amber' | 'emerald';
export type FontStyle = 'sans' | 'serif' | 'mono';
export type DisplayDensity = 'compact' | 'comfortable' | 'spacious';

interface Settings {
  themeColor: ThemeColor;
  fontStyle: FontStyle;
  displayDensity: DisplayDensity;
  enableAnimations: boolean;
  glassmorphism: boolean;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
}

const defaultSettings: Settings = {
  themeColor: 'indigo',
  fontStyle: 'sans',
  displayDensity: 'comfortable',
  enableAnimations: true,
  glassmorphism: true,
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: () => {},
  resetSettings: () => {},
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('persona-chat-settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('persona-chat-settings', JSON.stringify(settings));
    
    // Apply settings to document root
    const root = document.documentElement;
    
    // Theme Color
    root.setAttribute('data-theme', settings.themeColor);
    
    // Font Style
    root.style.setProperty('--font-family', settings.fontStyle === 'serif' ? 'ui-serif, Georgia, serif' : 
                                           settings.fontStyle === 'mono' ? 'ui-monospace, SFMono-Regular, monospace' : 
                                           'Inter, system-ui, sans-serif');
    
    // Density
    root.setAttribute('data-density', settings.displayDensity);
    
    // Glassmorphism
    if (settings.glassmorphism) {
      root.classList.add('glass-enabled');
    } else {
      root.classList.remove('glass-enabled');
    }
    
  }, [settings]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      <div className={`theme-${settings.themeColor} font-${settings.fontStyle} density-${settings.displayDensity}`}>
        {children}
      </div>
    </SettingsContext.Provider>
  );
};
