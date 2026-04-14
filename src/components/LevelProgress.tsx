import React from 'react';
import { motion } from 'motion/react';
import { XP_PER_LEVEL } from '../lib/gamification';
import { Award, Zap } from 'lucide-react';

interface LevelProgressProps {
  level: number;
  xp: number;
  className?: string;
}

export function LevelProgress({ level, xp, className = '' }: LevelProgressProps) {
  const currentLevelXp = xp % XP_PER_LEVEL;
  const progress = (currentLevelXp / XP_PER_LEVEL) * 100;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/10 rounded-lg">
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-sm font-bold text-white">Level {level}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          <Zap className="w-3 h-3 text-amber-500" />
          <span>{currentLevelXp} / {XP_PER_LEVEL} XP</span>
        </div>
      </div>
      
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
        />
      </div>
    </div>
  );
}
