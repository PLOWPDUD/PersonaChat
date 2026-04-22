import React from 'react';
import { useSettings, ThemeColor, FontStyle, DisplayDensity } from '../contexts/SettingsContext';
import { Palette, Type, Maximize, Sparkles, Layout as LayoutIcon, RefreshCcw, Check, Bell, ShieldAlert, BellOff, Globe } from 'lucide-react';
import { getNotificationSupport, requestNotificationPermission, showSystemNotification } from '../lib/notifications';
import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
];

const themeColors: { id: ThemeColor; color: string; label: string }[] = [
  { id: 'indigo', color: '#6366f1', label: 'Indigo' },
  { id: 'purple', color: '#a855f7', label: 'Purple' },
  { id: 'blue', color: '#3b82f6', label: 'Blue' },
  { id: 'green', color: '#22c55e', label: 'Green' },
  { id: 'red', color: '#ef4444', label: 'Red' },
  { id: 'pink', color: '#ec4899', label: 'Pink' },
  { id: 'amber', color: '#f59e0b', label: 'Amber' },
  { id: 'emerald', color: '#10b981', label: 'Emerald' },
];

const fontStyles: { id: FontStyle; label: string; description: string }[] = [
  { id: 'sans', label: 'Modern Sans', description: 'Clean and highly readable' },
  { id: 'serif', label: 'Elegant Serif', description: 'Classic editorial feel' },
  { id: 'mono', label: 'Technical Mono', description: 'Precise and structured' },
];

const densities: { id: DisplayDensity; label: string; description: string }[] = [
  { id: 'compact', label: 'Compact', description: 'More content, less space' },
  { id: 'comfortable', label: 'Comfortable', description: 'Balanced spacing' },
  { id: 'spacious', label: 'Spacious', description: 'Breathable and relaxed' },
];

export function Settings() {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings, resetSettings } = useSettings();
  const [notifStatus, setNotifStatus] = React.useState(getNotificationSupport());

  const handleRequestNotif = async () => {
    const granted = await requestNotificationPermission();
    setNotifStatus(getNotificationSupport());
    if (granted) {
      showSystemNotification('Alerts Active!', { body: 'Notifications are now configured correctly.' });
    }
  };

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('settings.title')}</h1>
          <p className="text-zinc-400 mt-1">{t('settings.subtitle')}</p>
        </div>
        <button
          onClick={resetSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-sm font-medium"
        >
          <RefreshCcw className="w-4 h-4" />
          {t('settings.reset')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Language Selection */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 glass-card col-span-full">
          <div className="flex items-center gap-3 text-white font-semibold">
            <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary">
              <Globe className="w-5 h-5" />
            </div>
            {t('settings.language')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                  i18n.language === lang.code 
                    ? 'bg-zinc-800 border-theme-primary text-white' 
                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="font-medium">{lang.label}</span>
                {i18n.language === lang.code && (
                  <div className="ml-auto">
                    <Check className="w-4 h-4 text-theme-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 glass-card col-span-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-white font-semibold">
              <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary">
                <Bell className="w-5 h-5" />
              </div>
              {t('settings.notifications.section')}
            </div>
            {!notifStatus.supported ? (
              <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                {t('settings.notifications.notSupported')}
              </span>
            ) : notifStatus.permission === 'granted' ? (
              <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                <Check className="w-3 h-3" /> {t('settings.notifications.enabled')}
              </span>
            ) : notifStatus.permission === 'denied' ? (
              <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                <BellOff className="w-3 h-3" /> {t('settings.notifications.blocked')}
              </span>
            ) : (
              <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                {t('settings.notifications.inactive')}
              </span>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-4">
            <div className="flex items-start gap-4">
              <div className="mt-1">
                {notifStatus.permission === 'granted' ? (
                  <Bell className="w-8 h-8 text-green-500" />
                ) : notifStatus.permission === 'denied' ? (
                  <BellOff className="w-8 h-8 text-red-500" />
                ) : (
                  <Bell className="w-8 h-8 text-zinc-600" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-white font-bold">{t('settings.notifications.liveTitle')}</h4>
                <p className="text-zinc-400 text-sm mt-1">
                  {t('settings.notifications.liveDesc')}
                </p>
                
                {notifStatus.permission === 'denied' && (
                  <div className="mt-3 flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-400 leading-relaxed">
                      {t('settings.notifications.blockedDesc')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              disabled={!notifStatus.supported || notifStatus.permission === 'granted'}
              onClick={handleRequestNotif}
              className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                notifStatus.permission === 'granted'
                  ? 'bg-zinc-800 text-zinc-500 cursor-default'
                  : notifStatus.supported
                    ? 'bg-theme-primary text-white hover:bg-theme-primary-hover shadow-lg shadow-theme-glow'
                    : 'bg-zinc-900 text-zinc-700 cursor-not-allowed'
              }`}
            >
              {notifStatus.permission === 'granted' ? (
                <>
                  <Check className="w-5 h-5" />
                  {t('settings.notifications.btnActive')}
                </>
              ) : notifStatus.permission === 'denied' ? (
                t('settings.notifications.btnReset')
              ) : notifStatus.supported ? (
                t('settings.notifications.btnEnable')
              ) : (
                t('settings.notifications.btnNoSupport')
              )}
            </button>
          </div>
        </section>

        {/* Theme Color */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 glass-card">
          <div className="flex items-center gap-3 text-white font-semibold">
            <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary">
              <Palette className="w-5 h-5" />
            </div>
            {t('settings.themeColor')}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {themeColors.map((theme) => (
              <button
                key={theme.id}
                onClick={() => updateSettings({ themeColor: theme.id })}
                className={`group relative flex flex-col items-center gap-2 p-2 rounded-2xl transition-all ${
                  settings.themeColor === theme.id ? 'bg-zinc-800 ring-2 ring-theme-primary' : 'hover:bg-zinc-800/50'
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-full shadow-lg"
                  style={{ backgroundColor: theme.color }}
                />
                <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200">{theme.label}</span>
                {settings.themeColor === theme.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-theme-primary rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Font Style */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 glass-card">
          <div className="flex items-center gap-3 text-white font-semibold">
            <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary">
              <Type className="w-5 h-5" />
            </div>
            {t('settings.typography')}
          </div>
          <div className="space-y-2">
            {fontStyles.map((font) => (
              <button
                key={font.id}
                onClick={() => updateSettings({ fontStyle: font.id })}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                  settings.fontStyle === font.id 
                    ? 'bg-zinc-800 border-theme-primary text-white' 
                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="text-left">
                  <div className={`font-semibold ${font.id === 'serif' ? 'font-serif' : font.id === 'mono' ? 'font-mono' : 'font-sans'}`}>
                    {font.label}
                  </div>
                  <div className="text-xs text-zinc-500">{font.description}</div>
                </div>
                {settings.fontStyle === font.id && <Check className="w-5 h-5 text-theme-primary" />}
              </button>
            ))}
          </div>
        </section>

        {/* Display Density */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 glass-card">
          <div className="flex items-center gap-3 text-white font-semibold">
            <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary">
              <Maximize className="w-5 h-5" />
            </div>
            {t('settings.displayDensity')}
          </div>
          <div className="space-y-2">
            {densities.map((density) => (
              <button
                key={density.id}
                onClick={() => updateSettings({ displayDensity: density.id })}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                  settings.displayDensity === density.id 
                    ? 'bg-zinc-800 border-theme-primary text-white' 
                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="text-left">
                  <div className="font-semibold">{density.label}</div>
                  <div className="text-xs text-zinc-500">{density.description}</div>
                </div>
                {settings.displayDensity === density.id && <Check className="w-5 h-5 text-theme-primary" />}
              </button>
            ))}
          </div>
        </section>

        {/* Visual Effects */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 glass-card">
          <div className="flex items-center gap-3 text-white font-semibold">
            <div className="w-8 h-8 rounded-lg bg-theme-primary/10 flex items-center justify-center text-theme-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            {t('settings.visualEffects')}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <div className="flex items-center gap-3">
                <LayoutIcon className="w-5 h-5 text-zinc-400" />
                <div>
                  <div className="text-sm font-medium text-white">{t('settings.glassmorphism')}</div>
                  <div className="text-xs text-zinc-500">{t('settings.glassmorphismDesc')}</div>
                </div>
              </div>
              <button
                onClick={() => updateSettings({ glassmorphism: !settings.glassmorphism })}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  settings.glassmorphism ? 'bg-theme-primary' : 'bg-zinc-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  settings.glassmorphism ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-zinc-400" />
                <div>
                  <div className="text-sm font-medium text-white">{t('settings.animations')}</div>
                  <div className="text-xs text-zinc-500">{t('settings.animationsDesc')}</div>
                </div>
              </div>
              <button
                onClick={() => updateSettings({ enableAnimations: !settings.enableAnimations })}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  settings.enableAnimations ? 'bg-theme-primary' : 'bg-zinc-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  settings.enableAnimations ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Preview Section */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 glass-card">
        <h2 className="text-xl font-bold text-white mb-6">{t('settings.livePreview')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-800 border border-zinc-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-theme-primary" />
                <div>
                  <div className="text-sm font-bold text-white">Preview Character</div>
                  <div className="text-xs text-zinc-500">{t('settings.previewChat1')}</div>
                </div>
              </div>
              <p className="text-sm text-zinc-300">
                {t('settings.previewChat2')}
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-theme-primary hover:bg-theme-primary-hover text-white font-bold transition-all shadow-lg shadow-theme-glow">
              {t('settings.previewBtn')}
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="bg-theme-primary text-white p-3 rounded-2xl rounded-tr-none max-w-[80%] text-sm">
                {t('settings.previewChat3')}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-zinc-800 text-zinc-200 p-3 rounded-2xl rounded-tl-none max-w-[80%] text-sm border border-zinc-700">
                {t('settings.previewChat4', { color: settings.themeColor, font: settings.fontStyle })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
