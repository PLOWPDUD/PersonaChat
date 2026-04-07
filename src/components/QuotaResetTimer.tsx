import React, { useState, useEffect } from 'react';

export const QuotaResetTimer = () => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      // Supabase quota resets at midnight UTC
      const nextMidnight = new Date(now);
      nextMidnight.setUTCHours(24, 0, 0, 0);

      const difference = nextMidnight.getTime() - now.getTime();

      if (difference <= 0) {
        setTimeLeft('00:00:00');
        return;
      }

      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-4 text-sm text-red-700 font-mono">
      Estimated time until quota reset: <span className="font-bold">{timeLeft}</span>
    </div>
  );
};
