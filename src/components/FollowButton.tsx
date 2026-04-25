import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, deleteDoc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { addNotification } from '../lib/gamification';
import { playSound } from '../lib/sounds';

interface FollowButtonProps {
  targetUserId: string;
  targetUserName: string;
}

export function FollowButton({ targetUserId, targetUserName }: FollowButtonProps) {
  const { user, profile } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user || user.uid === targetUserId) {
      setLoading(false);
      return;
    }

    const checkFollow = async () => {
      const followId = `${user.uid}_${targetUserId}`;
      const cacheKey = `follow_${followId}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < 15 * 60 * 1000) { // 15 min cache
            setIsFollowing(parsed.status);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("Follow cache parse error");
        }
      }

      try {
        const followSnap = await getDoc(doc(db, 'followers', followId));
        const status = followSnap.exists();
        setIsFollowing(status);
        localStorage.setItem(cacheKey, JSON.stringify({
          status,
          timestamp: Date.now()
        }));
      } catch (err) {
        console.error('Error checking follow status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkFollow();
  }, [user, targetUserId]);

  const handleFollow = async () => {
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    playSound('click');

    try {
      const followId = `${user.uid}_${targetUserId}`;
      const followRef = doc(db, 'followers', followId);
      const targetUserRef = doc(db, 'profiles', targetUserId);
      const currentUserRef = doc(db, 'profiles', user.uid);

      if (isFollowing) {
        await deleteDoc(followRef);
        await updateDoc(targetUserRef, { followersCount: increment(-1) });
        await updateDoc(currentUserRef, { followingCount: increment(-1) });
        setIsFollowing(false);
        localStorage.setItem(`follow_${followId}`, JSON.stringify({ status: false, timestamp: Date.now() }));
      } else {
        await setDoc(followRef, {
          followerId: user.uid,
          followingId: targetUserId,
          createdAt: serverTimestamp()
        });
        await updateDoc(targetUserRef, { followersCount: increment(1) });
        await updateDoc(currentUserRef, { followingCount: increment(1) });
        setIsFollowing(true);
        localStorage.setItem(`follow_${followId}`, JSON.stringify({ status: true, timestamp: Date.now() }));
        
        // Notify target user
        await addNotification(targetUserId, 'new_follower', 'New Follower!', `${profile?.displayName || 'Someone'} started following you!`, { followerId: user.uid });
        playSound('success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'followers');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || user.uid === targetUserId) return null;
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;

  return (
    <button
      onClick={handleFollow}
      disabled={isSubmitting}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
        isFollowing 
          ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' 
          : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
      }`}
    >
      {isSubmitting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isFollowing ? (
        <>
          <UserMinus className="w-4 h-4" />
          <span>Unfollow</span>
        </>
      ) : (
        <>
          <UserPlus className="w-4 h-4" />
          <span>Follow</span>
        </>
      )}
    </button>
  );
}
