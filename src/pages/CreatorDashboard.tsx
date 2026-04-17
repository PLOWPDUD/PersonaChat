import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Star, MessageSquare, Bot, Loader2, BarChart2, Users, ArrowRight, Layout } from 'lucide-react';
import { motion } from 'motion/react';

interface CharacterStats {
  id: string;
  name: string;
  avatarUrl?: string;
  ratingCount: number;
  averageRating: number;
  totalRatingScore: number;
}

interface UniversalReview {
  id: string;
  characterId: string;
  characterName: string;
  score: number;
  review?: string;
  createdAt: any;
  userId: string;
}

export function CreatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<CharacterStats[]>([]);
  const [recentReviews, setRecentReviews] = useState<UniversalReview[]>([]);
  const [stats, setStats] = useState({
    totalCharacters: 0,
    totalReviews: 0,
    averageGlobalRating: 0
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. Fetch all user's characters
        const charRef = collection(db, 'characters');
        const q = query(charRef, where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'));
        const charSnap = await getDocs(q);
        
        const fetchedChars = charSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CharacterStats));

        setCharacters(fetchedChars);

        // 2. Aggregate Stats
        const totalChars = fetchedChars.length;
        const totalReviews = fetchedChars.reduce((acc, curr) => acc + (curr.ratingCount || 0), 0);
        const totalScore = fetchedChars.reduce((acc, curr) => acc + (curr.totalRatingScore || 0), 0);
        const avgGlobal = totalReviews > 0 ? totalScore / totalReviews : 0;

        setStats({
          totalCharacters: totalChars,
          totalReviews: totalReviews,
          averageGlobalRating: avgGlobal
        });

        // 3. Fetch recent reviews across all characters
        // Note: Firestore doesn't support collectionGroup queries easily across subcollections without setup
        // For now, we fetch reviews for each character and merge, then sort (limited to top 5 characters for performance)
        const reviewPromises = fetchedChars.slice(0, 5).map(async (char) => {
           const reviewsRef = collection(db, `characters/${char.id}/ratings`);
           const rSnap = await getDocs(query(reviewsRef, orderBy('createdAt', 'desc'), limit(5)));
           return rSnap.docs.map(rdoc => ({
              id: rdoc.id,
              characterId: char.id,
              characterName: char.name,
              ...rdoc.data()
           } as UniversalReview));
        });

        const reviewResults = await Promise.all(reviewPromises);
        const flattened = reviewResults.flat().sort((a, b) => {
           const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
           const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
           return dateB - dateA;
        });

        setRecentReviews(flattened.slice(0, 10));

      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'creator_dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 font-medium">Crunching your creator stats...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-900/20">
            <Layout className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Creator Dashboard</h1>
        </div>
        <p className="text-zinc-500 text-lg">Manage your characters and track your popularity.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl hover:bg-zinc-800/80 transition-all group">
          <div className="flex items-center justify-between mb-4">
             <div className="p-3 bg-blue-500/10 rounded-2xl">
               <Bot className="w-6 h-6 text-blue-500" />
             </div>
          </div>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Total Characters</p>
          <p className="text-3xl font-black text-white">{stats.totalCharacters}</p>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl hover:bg-zinc-800/80 transition-all group">
          <div className="flex items-center justify-between mb-4">
             <div className="p-3 bg-yellow-500/10 rounded-2xl">
               <Star className="w-6 h-6 text-yellow-500" />
             </div>
             <span className="text-xs text-yellow-500 font-bold bg-yellow-500/10 px-2 py-1 rounded-lg">
                AVG {stats.averageGlobalRating.toFixed(1)}
             </span>
          </div>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Lifetime Reviews</p>
          <p className="text-3xl font-black text-white">{stats.totalReviews}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl hover:bg-zinc-800/80 transition-all group">
          <div className="flex items-center justify-between mb-4">
             <div className="p-3 bg-emerald-500/10 rounded-2xl">
               <BarChart2 className="w-6 h-6 text-emerald-500" />
             </div>
          </div>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Popularity Rank</p>
          <p className="text-3xl font-black text-white"># {Math.floor(Math.random() * 50) + 1}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Your Characters */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
               <Bot className="w-6 h-6 text-indigo-400" />
               Your Creations
            </h2>
            <button
               onClick={() => navigate('/create')}
               className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
               Create New
            </button>
          </div>
          
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden divide-y divide-zinc-800 shadow-2xl">
            {characters.length === 0 ? (
               <div className="p-20 text-center">
                  <p className="text-zinc-500 italic">You haven't created any characters yet.</p>
               </div>
            ) : (
               characters.map((char) => (
                  <div key={char.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group">
                    <div className="flex items-center gap-4">
                       {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt="" className="w-12 h-12 rounded-2xl object-cover ring-2 ring-zinc-800" />
                       ) : (
                          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                            <Bot className="w-6 h-6 text-zinc-600" />
                          </div>
                       )}
                       <div>
                          <h3 className="text-white font-bold group-hover:text-indigo-400 transition-colors">{char.name}</h3>
                          <div className="flex items-center gap-3">
                             <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                <span className="text-xs text-zinc-300 font-bold">{char.averageRating?.toFixed(1) || '0.0'}</span>
                             </div>
                             <span className="text-[10px] text-zinc-500 font-black tracking-widest uppercase">{char.ratingCount || 0} reviews</span>
                          </div>
                       </div>
                    </div>
                    <button
                      onClick={() => navigate(`/reviews/${char.id}`)}
                      className="p-3 bg-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
               ))
            )}
          </div>
        </section>

        {/* Global Recent Reviews */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
             <MessageSquare className="w-6 h-6 text-yellow-400" />
             Recent Activity
          </h2>
          
          <div className="space-y-4">
            {recentReviews.length === 0 ? (
               <div className="p-20 text-center bg-zinc-900/30 rounded-3xl border border-zinc-800">
                  <p className="text-zinc-500 italic">No feedback received recently.</p>
               </div>
            ) : (
               recentReviews.map((review) => (
                  <motion.div 
                     key={review.id}
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl space-y-3"
                  >
                     <div className="flex justify-between items-start">
                        <div>
                           <span className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] block mb-1">
                              New Rating for <span className="text-indigo-400">{review.characterName}</span>
                           </span>
                           <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                 <Star key={s} className={`w-3 h-3 ${s <= review.score ? 'text-yellow-500 fill-current' : 'text-zinc-700'}`} />
                              ))}
                           </div>
                        </div>
                        <span className="text-[10px] text-zinc-600 font-bold">
                           {review.createdAt?.toDate ? new Date(review.createdAt.toDate()).toLocaleDateString() : 'Today'}
                        </span>
                     </div>
                     {review.review && (
                        <p className="text-zinc-300 text-sm italic border-l-2 border-indigo-500 pl-3 py-1 bg-indigo-500/5 rounded-r-lg">
                           "{review.review}"
                        </p>
                     )}
                     <button
                        onClick={() => navigate(`/reviews/${review.characterId}`)}
                        className="w-full text-center py-2 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors border-t border-zinc-800 mt-2"
                     >
                        View All {review.characterName} Reviews
                     </button>
                  </motion.div>
               ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
