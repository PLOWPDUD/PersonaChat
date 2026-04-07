import React, { useState, useEffect } from 'react';
import { Clock, Play, RotateCcw } from 'lucide-react';

export function ChatTimer() {
  const [minutes, setMinutes] = useState(25); // Default 25 minutes
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      setIsFinished(true);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const startTimer = () => {
    setTimeLeft(minutes * 60);
    setIsActive(true);
    setIsFinished(false);
  };

  const resetTimer = () => {
    setIsActive(false);
    setIsFinished(false);
    setTimeLeft(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-zinc-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-semibold">
          <Clock className="w-5 h-5 text-theme-primary" />
          <span>Chat Timer</span>
        </div>
        {isActive && (
          <div className="text-xl font-mono font-bold text-white">
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {isFinished ? (
        <div className="text-center py-2 bg-green-900/20 border border-green-800 rounded text-green-400 font-bold">
          Time to chat!
        </div>
      ) : !isActive ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-center"
            min="1"
          />
          <span className="text-zinc-400">min</span>
          <button
            onClick={startTimer}
            className="flex-1 flex items-center justify-center gap-2 bg-theme-primary hover:bg-theme-primary-dark text-white rounded px-4 py-1 transition-colors"
          >
            <Play className="w-4 h-4" /> Start
          </button>
        </div>
      ) : (
        <button
          onClick={resetTimer}
          className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded px-4 py-1 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      )}
    </div>
  );
}
