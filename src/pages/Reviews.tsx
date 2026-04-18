import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc, orderBy, limit, startAfter } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Star, User, Loader2, ArrowLeft, MessageSquare, Bot, Calendar } from 'lucide-react';
import { motion } from 'motion/react';

interface Review {
  id: string;
  userId: string;
  characterId: string;
  score: number;
  review?: string;
  createdAt: any;
  user?: {
    displayName: string;
    photoURL: string;
  };
}

export function Reviews() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [character, setCharacter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 10;

  useEffect(() => {
    if (!characterId) return;

    const fetchData = async () => {
      try {
        // Fetch Character Info
        const charRef = doc(db, 'characters', characterId);
        const charSnap = await getDoc(charRef);
        if (charSnap.exists()) {
          setCharacter({ id: charSnap.id, ...charSnap.data() });
        } else {
          navigate('/404');
          return;
        }

        // Fetch Initial Reviews
        const reviewsRef = collection(db, `characters/${characterId}/ratings`);
        const q = query(reviewsRef, orderBy('createdAt', 'desc'), limit(pageSize));
        const snap = await getDocs(q);
        
        const fetchedReviews = await Promise.all(snap.docs.map(async (reviewDoc) => {
          const data = reviewDoc.data();
          let userData = null;
          try {
            const userSnap = await getDoc(doc(db, 'profiles', data.userId));
            if (userSnap.exists()) {
              userData = userSnap.data();
            }
          } catch (e) {
            console.error('Error fetching user profile for review:', e);
          }
          
          return {
            id: reviewDoc.id,
            ...data,
            user: userData
          } as Review;
        }));

        setReviews(fetchedReviews);
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === pageSize);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `characters/${characterId}/ratings`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [characterId, navigate]);

  const loadMore = async () => {
    if (!lastVisible || !characterId || !hasMore) return;

    try {
      const reviewsRef = collection(db, `characters/${characterId}/ratings`);
      const q = query(reviewsRef, orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(pageSize));
      const snap = await getDocs(q);
      
      const newReviews = await Promise.all(snap.docs.map(async (reviewDoc) => {
        const data = reviewDoc.data();
        let userData = null;
        try {
          const userSnap = await getDoc(doc(db, 'profiles', data.userId));
          if (userSnap.exists()) {
            userData = userSnap.data();
          }
        } catch (e) {
          console.error('Error fetching user profile for review:', e);
        }
        
        return {
          id: reviewDoc.id,
          ...data,
          user: userData
        } as Review;
      }));

      setReviews(prev => [...prev, ...newReviews]);
      setLastVisible(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === pageSize);
    } catch (error) {
      console.error('Error loading more reviews:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 font-medium">Loading reviews...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>Back</span>
        </button>

        {user && characterId && (
          <button
            onClick={() => navigate(`/chat/${characterId}?review=true`)}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-900/20"
          >
            <Star className="w-4 h-4 fill-current" />
            Write a Review
          </button>
        )}
        
        {character && (
          <div className="flex items-center gap-4 bg-zinc-900/50 px-4 py-2 rounded-2xl border border-zinc-800">
             {character.avatarUrl ? (
                <img src={character.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
             ) : (
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-zinc-500" />
                </div>
             )}
             <div>
                <h2 className="text-white font-bold text-sm">{character.name}</h2>
                <div className="flex items-center gap-2">
                   <div className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 text-yellow-500 fill-current" />
                      <span className="text-xs text-zinc-300 font-bold">{character.averageRating?.toFixed(1) || '0.0'}</span>
                   </div>
                   <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">• {character.ratingCount || 0} reviews</span>
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-xl">
            <MessageSquare className="w-6 h-6 text-yellow-500" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Character Reviews</h1>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {reviews.length === 0 ? (
            <div className="text-center py-20 bg-zinc-900/30 rounded-3xl border border-zinc-800 border-dashed">
              <Star className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
              <p className="text-zinc-500 italic">No reviews yet for this character.</p>
            </div>
          ) : (
            reviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {review.user?.photoURL ? (
                      <img 
                        src={review.user.photoURL} 
                        alt="" 
                        className="w-10 h-10 rounded-full object-cover border border-zinc-800" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-800">
                        <User className="w-5 h-5 text-zinc-600" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-white font-bold text-sm leading-none mb-1">
                        {review.user?.displayName || 'Unknown User'}
                      </h3>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star 
                            key={star} 
                            className={`w-3 h-3 ${star <= review.score ? 'text-yellow-500 fill-current' : 'text-zinc-700'}`} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                    <Calendar className="w-3 h-3" />
                    {review.createdAt?.toDate ? new Date(review.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                  </div>
                </div>

                {review.review ? (
                  <div className="bg-zinc-950 border border-zinc-800/50 rounded-2xl p-4 text-zinc-300 text-sm leading-relaxed italic">
                    "{review.review}"
                  </div>
                ) : (
                  <p className="text-zinc-600 text-xs italic italic">No text review provided.</p>
                )}
              </motion.div>
            ))
          )}
        </div>

        {hasMore && reviews.length > 0 && (
          <button
            onClick={loadMore}
            className="w-full py-4 bg-zinc-900 border border-zinc-800 rounded-3xl text-zinc-400 font-bold hover:text-white hover:bg-zinc-800 transition-all shadow-lg"
          >
            Load More Reviews
          </button>
        )}
      </div>
    </div>
  );
}
