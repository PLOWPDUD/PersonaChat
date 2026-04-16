import React, { useState, useEffect } from 'react';
import { ShieldAlert, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export function BannedScreen() {
  const { profile, user } = useAuth();
  const [appealReason, setAppealReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const banExpiresAt = profile?.banExpiresAt ? new Date(profile.banExpiresAt.toDate()) : null;
  const isInfinite = !banExpiresAt;

  const [timeLeft, setTimeLeft] = useState(banExpiresAt ? banExpiresAt.getTime() - Date.now() : 0);

  useEffect(() => {
    if (isInfinite) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTimeLeft(Math.max(0, banExpiresAt!.getTime() - now));
    }, 1000);
    return () => clearInterval(timer);
  }, [banExpiresAt, isInfinite]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  const submitAppeal = async () => {
    if (!user || !appealReason.trim()) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'appeals'), {
        userId: user.uid,
        reason: appealReason,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting appeal:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-white mb-2">You are banned</h1>
        <p className="text-zinc-400 mb-6">{profile?.banReason || 'No reason provided.'}</p>
        
        {!isInfinite && (
          <div className="bg-zinc-800 p-4 rounded-xl mb-6">
            <p className="text-zinc-400 text-sm mb-1">Time remaining:</p>
            <p className="text-2xl font-mono font-bold text-white">{formatTime(timeLeft)}</p>
          </div>
        )}

        {submitted ? (
          <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl">
            <p className="text-green-400 font-bold">Appeal submitted successfully.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Explain why you should be unbanned..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
              rows={4}
            />
            <button
              onClick={submitAppeal}
              disabled={isSubmitting || !appealReason.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
