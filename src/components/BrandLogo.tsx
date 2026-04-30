import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

interface BrandLogoProps {
  className?: string;
  themeColor?: string;
}

export function BrandLogo({ className = "w-8 h-8", themeColor }: BrandLogoProps) {
  const { settings } = useSettings();

  if (settings.logoStyle === 'classic') {
    return <MessageSquare className={`${className} text-purple-500`} />;
  }

  // New Icon Style using a high-quality SVG Sparkle
  return (
    <div className={`relative ${className} flex items-center justify-center`}>
      <Sparkles 
        className={`w-full h-full text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]`}
        fill="currentColor"
        fillOpacity={0.2}
      />
      <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full scale-150 -z-10" />
    </div>
  );
}
