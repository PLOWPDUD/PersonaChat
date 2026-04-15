import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  increment, 
  setDoc, 
  deleteDoc, 
  getDoc,
  where,
  startAfter,
  getDocs
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getCachedData, updateGlobalCache } from '../lib/cache';
import { QuotaExceeded } from '../components/QuotaExceeded';
import { moderateImage, ModerationResult } from '../services/aiService';
import { BADGES } from '../services/badgeService';
import { LevelProgress } from '../components/LevelProgress';
import { addXP, addNotification, checkAchievement, ACHIEVEMENTS } from '../lib/gamification';
import { playSound } from '../lib/sounds';
import { 
  MessageSquare, 
  Heart, 
  Share2, 
  Bookmark, 
  Plus, 
  Image as ImageIcon, 
  Send, 
  MoreHorizontal, 
  Trash2, 
  User,
  Loader2,
  X,
  Check,
  Upload,
  Paperclip,
  Link as LinkIcon,
  Youtube,
  ExternalLink,
  ShieldAlert,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  authorBadges?: string[];
  title?: string;
  content: string;
  imageUrls?: string[];
  link?: string;
  likesCount: number;
  commentsCount: number;
  createdAt: any;
  updatedAt?: any;
}

interface Comment {
  id: string;
  postId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  imageUrls?: string[];
  createdAt: any;
}

export default function PersonaCommunity() {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const { user, profile, quotaExceeded: globalQuotaExceeded, isOwner, isModerator } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [localQuotaExceeded, setLocalQuotaExceeded] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File, base64: string }[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<'recent' | 'trending'>('recent');
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);

  const compressImage = (file: File): Promise<{ blob: Blob, base64: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 800; // Reduced for base64 storage

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const base64 = canvas.toDataURL('image/jpeg', 0.5); // Reduced quality for base64 storage
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({ blob, base64 });
            } else {
              reject(new Error('Canvas to Blob failed'));
            }
          }, 'image/jpeg', 0.5);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleModerateUrl = async (url: string) => {
    if (!url.trim()) return;
    setIsModerating(true);
    setModerationError(null);
    try {
      // For URLs, we try to fetch and convert to base64 to moderate
      const response = await fetch(url);
      const blob = await response.blob();
      const base64 = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });

      if (!base64) {
        throw new Error("Failed to read image data");
      }

      const base64Data = base64.split(',')[1];
      if (!base64Data) {
        throw new Error("Invalid image data format");
      }

      const result = await moderateImage(base64Data, blob.type);
      if (!result.isAppropriate) {
        setModerationError(result.suggestion || 'This image contains inappropriate content and cannot be used.');
        setNewPostImage('');
      }
    } catch (error) {
      console.error("URL Moderation error:", error);
      // If CORS blocks us, we might have to skip or use a different approach
      // For now, we'll just log it.
    } finally {
      setIsModerating(false);
    }
  };
  
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userSaves, setUserSaves] = useState<Set<string>>(new Set());
  
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Fetch initial posts
  useEffect(() => {
    const fetchPosts = async () => {
      // Check cache first
      const cached = getCachedData('community_posts');
      if (cached && cached.length > 0) {
        setPosts(cached);
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'community_posts'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        const snapshot = await getDocs(q);
        const newPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Post));
        
        setPosts(newPosts);
        updateGlobalCache('community_posts', newPosts);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 10);
      } catch (error: any) {
        if (isQuotaError(error)) {
          setLocalQuotaExceeded(true);
        } else {
          handleFirestoreError(error, OperationType.LIST, 'community_posts');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [user]);

  // Fetch trending posts - use getDocs instead of onSnapshot for feed
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const q = query(
          collection(db, 'community_posts'),
          orderBy('likesCount', 'desc'),
          limit(5)
        );

        const snapshot = await getDocs(q);
        const trending = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Post));
        setTrendingPosts(trending);
      } catch (e) {
        console.error("Error fetching trending:", e);
      }
    };

    fetchTrending();
  }, []);

  // Fetch user likes and saves - Optimized to reduce reads
  useEffect(() => {
    if (!user) return;

    const fetchUserInteractions = async () => {
      try {
        // Fetch saves
        const savesSnap = await getDocs(collection(db, `users/${user.uid}/saved_posts`));
        setUserSaves(new Set(savesSnap.docs.map(doc => doc.id)));

        // Fetch likes for current posts in one go if possible
        // Since we can't easily do a multi-collection check, we'll at least cache them
        const postIds = posts.map(p => p.id);
        if (postIds.length > 0) {
          // We'll only check likes for posts we haven't checked yet
          for (const postId of postIds) {
            if (!userLikes.has(postId)) {
              const likeDoc = await getDoc(doc(db, `community_posts/${postId}/likes/${user.uid}`));
              if (likeDoc.exists()) {
                setUserLikes(prev => new Set(prev).add(postId));
              }
            }
          }
        }
      } catch (e) {
        if (isQuotaError(e)) setLocalQuotaExceeded(true);
        console.error("Error fetching interactions:", e);
      }
    };
    
    fetchUserInteractions();
  }, [user, posts.length]);

  const fetchMorePosts = async () => {
    if (!hasMore || isFetchingMore || !lastVisible) return;
    setIsFetchingMore(true);

    try {
      const q = query(
        collection(db, 'community_posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Post));

      setPosts(prev => [...prev, ...newPosts]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 10);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'community_posts');
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleCreatePost = async () => {
    if (!user || !profile || !newPostContent.trim()) return;
    setIsSubmitting(true);

    try {
      let finalImageUrls: string[] = [];
      if (newPostImage.trim()) {
        finalImageUrls.push(newPostImage.trim());
      }

      // Use base64 strings directly for "instant" loading
      if (selectedFiles.length > 0) {
        console.log(`Processing ${selectedFiles.length} images for instant posting...`);
        const base64Urls = selectedFiles.map(f => f.base64);
        finalImageUrls = [...finalImageUrls, ...base64Urls];
      }

      const detectedLink = extractLink(newPostContent);

      await addDoc(collection(db, 'community_posts'), {
        authorId: user.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL || '',
        authorBadges: profile.badges || [],
        title: newPostTitle.trim() || null,
        content: newPostContent.trim(),
        imageUrls: finalImageUrls.length > 0 ? finalImageUrls : null,
        link: detectedLink,
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Gamification
      await addXP(user.uid, 50);
      await checkAchievement(user.uid, ACHIEVEMENTS.FIRST_POST.id, ACHIEVEMENTS.FIRST_POST.name, ACHIEVEMENTS.FIRST_POST.description, ACHIEVEMENTS.FIRST_POST.icon, ACHIEVEMENTS.FIRST_POST.xp);
      playSound('success');

      setIsCreateModalOpen(false);
      setNewPostTitle('');
      setNewPostContent('');
      setNewPostImage('');
      setSelectedFiles([]);
      setImagePreviews([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'community_posts');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getYoutubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const extractLink = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const totalFiles = selectedFiles.length + files.length;
    if (totalFiles > 5) {
      alert('You can only upload a maximum of 5 images.');
      return;
    }

    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Max size is 5MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsModerating(true);
    setModerationError(null);

    try {
      const moderationPromises = validFiles.map(async (file) => {
        try {
          console.log(`Processing file: ${file.name}`);
          const { blob, base64 } = await compressImage(file);
          const base64Data = base64.split(',')[1];
          console.log(`Moderating file: ${file.name}`);
          const result = await moderateImage(base64Data, 'image/jpeg');
          console.log(`Moderation result for ${file.name}:`, result.isAppropriate);
          
          // Create a new File from the compressed blob
          const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
          
          return { file: compressedFile, result, base64 };
        } catch (err) {
          console.error("Compression/Moderation error for file:", file.name, err);
          // If compression or moderation fails, we'll try to use the original file to avoid blocking the user
          return { file, result: { isAppropriate: true }, base64: null };
        }
      });

      const results = await Promise.all(moderationPromises);

      const newSelectedFiles: { file: File, base64: string }[] = [];
      const newPreviews: string[] = [];

      for (const { file, result, base64 } of results) {
        if (!result.isAppropriate) {
          setModerationError(result.suggestion || `Image ${file.name} contains inappropriate content.`);
          setIsModerating(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        // If base64 is null (from catch block), we'll try to get it now for preview
        let finalBase64 = base64;
        if (!finalBase64) {
          finalBase64 = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file as File);
          });
        }

        if (finalBase64) {
          newSelectedFiles.push({ file: file as File, base64: finalBase64 });
          newPreviews.push(finalBase64);
        }
      }
      
      setSelectedFiles(prev => [...prev, ...newSelectedFiles]);
      setImagePreviews(prev => [...prev, ...newPreviews]);
      setNewPostImage(''); // Clear URL if file is selected
    } catch (error) {
      console.error("Moderation error:", error);
      // If moderation fails, we'll allow it but log it. 
      // Or we could block it to be safe. Let's allow for now to not break UX on AI hiccups.
    } finally {
      setIsModerating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;

    const isLiked = userLikes.has(postId);
    const likeRef = doc(db, `community_posts/${postId}/likes/${user.uid}`);
    const postRef = doc(db, 'community_posts', postId);

    try {
      if (isLiked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likesCount: increment(-1) });
        setUserLikes(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      } else {
        await setDoc(likeRef, { createdAt: serverTimestamp() });
        await updateDoc(postRef, { likesCount: increment(1) });
        setUserLikes(prev => {
          const next = new Set(prev);
          next.add(postId);
          return next;
        });
        
        // Notify author and award XP
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
          const postData = postSnap.data();
          if (postData.authorId !== user.uid) {
            await addNotification(postData.authorId, 'post_liked', 'New Like!', `${profile?.displayName || 'Someone'} liked your post.`, { postId });
            await addXP(postData.authorId, 10);
          }
          
          if (postData.likesCount + 1 >= 10) {
            await checkAchievement(postData.authorId, ACHIEVEMENTS.POPULAR_POST.id, ACHIEVEMENTS.POPULAR_POST.name, ACHIEVEMENTS.POPULAR_POST.description, ACHIEVEMENTS.POPULAR_POST.icon, ACHIEVEMENTS.POPULAR_POST.xp);
          }
        }
        playSound('like');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `community_posts/${postId}/likes`);
    }
  };

  const handleToggleSave = async (postId: string) => {
    if (!user) return;

    const isSaved = userSaves.has(postId);
    const saveRef = doc(db, `users/${user.uid}/saved_posts/${postId}`);

    try {
      if (isSaved) {
        await deleteDoc(saveRef);
        setUserSaves(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      } else {
        await setDoc(saveRef, { createdAt: serverTimestamp() });
        setUserSaves(prev => {
          const next = new Set(prev);
          next.add(postId);
          return next;
        });

        // Notify author
        const post = posts.find(p => p.id === postId);
        if (post && post.authorId !== user.uid) {
          await addNotification(post.authorId, 'post_saved', 'Post Saved', `${profile?.displayName || 'Someone'} saved your post.`, { postId });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/saved_posts`);
    }
  };

  const handleShare = (post: Post) => {
    const shareUrl = `${window.location.origin}/community?post=${post.id}`;
    if (navigator.share) {
      navigator.share({
        title: `Post by ${post.authorName}`,
        text: post.content,
        url: shareUrl
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    }
  };

  const fetchComments = (postId: string) => {
    setActiveCommentsPostId(postId);
    const q = query(
      collection(db, `community_posts/${postId}/comments`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Comment));
      setComments(newComments);
    });

    return unsubscribe;
  };

  // Handle comment subscription cleanup
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    if (activeCommentsPostId) {
      unsubscribe = fetchComments(activeCommentsPostId);
    } else {
      setComments([]);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeCommentsPostId]);

  const handleAddComment = async () => {
    if (!user || !profile || !activeCommentsPostId || (!newComment.trim() && !commentImage)) return;
    setIsSubmittingComment(true);

    try {
      let imageUrls: string[] = [];
      if (commentImage && commentImagePreview) {
        console.log("Using base64 for instant comment image loading...");
        imageUrls.push(commentImagePreview);
      }

      const commentData: any = {
        postId: activeCommentsPostId,
        authorId: user.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL || '',
        content: newComment.trim(),
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
        createdAt: serverTimestamp()
      };

      if (replyingTo) {
        commentData.parentId = replyingTo.id;
        commentData.content = `@${replyingTo.authorName} ${commentData.content}`;
      }

      await addDoc(collection(db, `community_posts/${activeCommentsPostId}/comments`), commentData);

      await updateDoc(doc(db, 'community_posts', activeCommentsPostId), {
        commentsCount: increment(1)
      });

      setNewComment('');
      setCommentImage(null);
      setCommentImagePreview(null);
      setReplyingTo(null);
      
      // Award XP for commenting
      await addXP(user.uid, 10);
      
      // Notify post author
      const post = posts.find(p => p.id === activeCommentsPostId);
      if (post && post.authorId !== user.uid) {
        await addNotification(post.authorId, 'post_commented', 'New Comment', `${profile?.displayName || 'Someone'} commented on your post.`, { postId: activeCommentsPostId });
      }

      // Notify parent comment author if it's a reply
      if (replyingTo && replyingTo.authorId !== user.uid) {
        await addNotification(replyingTo.authorId, 'comment_replied', 'New Reply', `${profile?.displayName || 'Someone'} replied to your comment.`, { postId: activeCommentsPostId });
      }

      playSound('success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `community_posts/${activeCommentsPostId}/comments`);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Max size is 5MB.');
      return;
    }

    setIsModerating(true);
    setModerationError(null);

    try {
      console.log(`Processing comment image: ${file.name}`);
      let blob: Blob;
      let base64: string;
      try {
        const compressed = await compressImage(file);
        blob = compressed.blob;
        base64 = compressed.base64;
      } catch (compressErr) {
        console.error("Comment image compression error:", compressErr);
        // Fallback to original file
        blob = file;
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const base64Data = base64.split(',')[1];
      console.log(`Moderating comment image: ${file.name}`);
      const result = await moderateImage(base64Data, 'image/jpeg');
      console.log(`Moderation result for comment image ${file.name}:`, result.isAppropriate);

      if (!result.isAppropriate) {
        setModerationError(result.suggestion || 'This image contains inappropriate content.');
        setIsModerating(false);
        return;
      }

      const finalFile = new File([blob], file.name, { type: blob.type || 'image/jpeg' });
      setCommentImage(finalFile);
      setCommentImagePreview(base64);
    } catch (error) {
      console.error("Moderation error:", error);
    } finally {
      setIsModerating(false);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      await deleteDoc(doc(db, `community_posts/${postId}/comments`, commentId));
      await updateDoc(doc(db, 'community_posts', postId), {
        commentsCount: increment(-1)
      });
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `community_posts/${postId}/comments/${commentId}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'community_posts', postId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `community_posts/${postId}`);
    }
  };

  const handleReportPost = async () => {
    if (!user || !reportPostId || !reportReason.trim()) return;
    setIsSubmittingReport(true);
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        targetId: reportPostId,
        type: 'post',
        reason: reportReason.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsReportModalOpen(false);
      setReportReason('');
      setReportPostId(null);
      alert('Report submitted successfully. Thank you for helping keep our community safe!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const quotaExceeded = globalQuotaExceeded || localQuotaExceeded;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (quotaExceeded) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <QuotaExceeded />
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
        <div className="lg:col-span-2 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">Community</h1>
            <div className="flex items-center gap-4 mt-2">
              <button 
                onClick={() => setFeedFilter('recent')}
                className={`text-sm font-bold uppercase tracking-widest transition-colors ${feedFilter === 'recent' ? 'text-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Recent
              </button>
              <button 
                onClick={() => setFeedFilter('trending')}
                className={`text-sm font-bold uppercase tracking-widest transition-colors ${feedFilter === 'trending' ? 'text-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Trending
              </button>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 font-bold"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">New Post</span>
          </button>
        </div>

        {/* Posts Feed */}
        <div className="space-y-6">
          {(feedFilter === 'recent' ? posts : trendingPosts).map(post => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden group hover:border-zinc-700 transition-all"
          >
            {/* Post Header */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {post.authorPhoto ? (
                  <img src={post.authorPhoto} alt="" className="w-10 h-10 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                    <User className="w-5 h-5 text-zinc-500" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-bold text-sm">{post.authorName}</p>
                    {post.authorBadges && post.authorBadges.length > 0 && (
                      <div className="flex gap-0.5">
                        {post.authorBadges.map((badgeId: string) => {
                          const badge = BADGES.find(b => b.id === badgeId);
                          if (!badge) return null;
                          return (
                            <span key={badgeId} className="text-[10px]" title={badge.label}>
                              {badge.icon}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider font-bold">
                    {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                  </p>
                </div>
              </div>
              {(user?.uid === post.authorId || isModerator) && (
                <button 
                  onClick={() => handleDeletePost(post.id)}
                  className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                  title="Delete Post"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Post Content */}
            <div className="px-4 pb-4 space-y-4">
              {post.title && (
                <h3 className="text-xl font-bold text-white tracking-tight">{post.title}</h3>
              )}
              <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
              
              {post.link && (
                <div className="space-y-3">
                  {getYoutubeId(post.link) ? (
                    <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${getYoutubeId(post.link)}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      ></iframe>
                    </div>
                  ) : (
                    <a 
                      href={post.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl hover:border-indigo-500/50 transition-all group/link"
                    >
                      <div className="p-2 bg-zinc-900 rounded-lg">
                        <ExternalLink className="w-5 h-5 text-zinc-400 group-hover/link:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-300 text-sm font-medium truncate">{post.link}</p>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wider font-bold">External Link</p>
                      </div>
                    </a>
                  )}
                </div>
              )}

              {post.imageUrls && post.imageUrls.length > 0 && (
                <div className={`grid gap-2 ${
                  post.imageUrls.length === 1 ? 'grid-cols-1' : 
                  post.imageUrls.length === 2 ? 'grid-cols-2' : 
                  'grid-cols-2 sm:grid-cols-3'
                }`}>
                  {post.imageUrls.map((url, idx) => (
                    <div key={idx} className={`rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 ${
                      post.imageUrls?.length === 1 ? '' : 'aspect-square'
                    }`}>
                      <img 
                        src={url} 
                        alt="" 
                        className="w-full h-full object-cover cursor-pointer" 
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Post Actions */}
            <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggleLike(post.id)}
                  className={`flex items-center gap-1.5 text-sm font-bold transition-all ${
                    userLikes.has(post.id) ? 'text-red-500' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${userLikes.has(post.id) ? 'fill-current' : ''}`} />
                  <span>{post.likesCount || 0}</span>
                </button>
                <button
                  onClick={() => activeCommentsPostId === post.id ? setActiveCommentsPostId(null) : setActiveCommentsPostId(post.id)}
                  className={`flex items-center gap-1.5 text-sm font-bold transition-all ${
                    activeCommentsPostId === post.id ? 'text-indigo-400' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>{post.commentsCount || 0}</span>
                </button>
                <button
                  onClick={() => handleShare(post)}
                  className="p-2 text-zinc-400 hover:text-white transition-all"
                  title="Share"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                {user?.uid !== post.authorId && (
                  <button
                    onClick={() => {
                      setReportPostId(post.id);
                      setIsReportModalOpen(true);
                    }}
                    className="p-2 text-zinc-400 hover:text-red-400 transition-all"
                    title="Report Post"
                  >
                    <ShieldAlert className="w-5 h-5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => handleToggleSave(post.id)}
                className={`p-2 transition-all ${
                  userSaves.has(post.id) ? 'text-yellow-500' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Bookmark className={`w-5 h-5 ${userSaves.has(post.id) ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Comments Section */}
            <AnimatePresence>
              {activeCommentsPostId === post.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-zinc-800 bg-zinc-950/50"
                >
                  <div className="p-4 space-y-4">
                    <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                      {comments.length === 0 ? (
                        <p className="text-center py-4 text-zinc-500 text-sm italic">No comments yet. Be the first!</p>
                      ) : (
                        comments.filter(c => !c.parentId).map(comment => (
                          <div key={comment.id} className="space-y-3">
                            <div className="flex gap-3">
                              {comment.authorPhoto ? (
                                <img src={comment.authorPhoto} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                                  <User className="w-4 h-4 text-zinc-500" />
                                </div>
                              )}
                              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-white text-xs font-bold">{comment.authorName}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-zinc-600 text-[10px]">
                                      {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                    </span>
                                    {(user?.uid === comment.authorId || isModerator) && (
                                      <button
                                        onClick={() => handleDeleteComment(post.id, comment.id)}
                                        className="text-zinc-600 hover:text-red-500 transition-colors"
                                        title="Delete Comment"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="text-zinc-300 text-sm leading-relaxed">{comment.content}</p>
                                {comment.imageUrls && comment.imageUrls.length > 0 && (
                                  <div className="mt-2 grid grid-cols-1 gap-2">
                                    {comment.imageUrls.map((url, idx) => (
                                      <img key={idx} src={url} alt="Comment attachment" className="rounded-lg max-h-60 object-contain" referrerPolicy="no-referrer" />
                                    ))}
                                  </div>
                                )}
                                <div className="mt-2 flex items-center gap-4">
                                  <button 
                                    onClick={() => setReplyingTo(comment)}
                                    className="text-[10px] font-bold text-zinc-500 hover:text-indigo-400 uppercase tracking-widest transition-colors"
                                  >
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Replies */}
                            {comments.filter(r => r.parentId === comment.id).map(reply => (
                              <div key={reply.id} className="flex gap-3 ml-8">
                                {reply.authorPhoto ? (
                                  <img src={reply.authorPhoto} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                                    <User className="w-3 h-3 text-zinc-500" />
                                  </div>
                                )}
                                <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-white text-[10px] font-bold">{reply.authorName}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-zinc-600 text-[10px]">
                                        {reply.createdAt?.toDate ? new Date(reply.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                      </span>
                                      {(user?.uid === reply.authorId || isModerator) && (
                                        <button
                                          onClick={() => handleDeleteComment(post.id, reply.id)}
                                          className="text-zinc-600 hover:text-red-500 transition-colors"
                                          title="Delete Reply"
                                        >
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-zinc-300 text-xs leading-relaxed">{reply.content}</p>
                                  {reply.imageUrls && reply.imageUrls.length > 0 && (
                                    <div className="mt-2 grid grid-cols-1 gap-2">
                                      {reply.imageUrls.map((url, idx) => (
                                        <img key={idx} src={url} alt="Reply attachment" className="rounded-lg max-h-40 object-contain" referrerPolicy="no-referrer" />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      {replyingTo && (
                        <div className="flex items-center justify-between px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                            Replying to @{replyingTo.authorName}
                          </p>
                          <button onClick={() => setReplyingTo(null)} className="text-zinc-500 hover:text-white">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleCommentFileChange}
                          className="hidden"
                          id="comment-image-upload"
                        />
                        <label
                          htmlFor="comment-image-upload"
                          className="p-2 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                        >
                          <ImageIcon className="w-5 h-5" />
                        </label>
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder={replyingTo ? "Write a reply..." : "Add a comment..."}
                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                        />
                        <button
                          onClick={handleAddComment}
                          disabled={isSubmittingComment || isModerating || (!newComment.trim() && !commentImage)}
                          className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-all min-w-[40px] flex items-center justify-center"
                        >
                          {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    {isModerating && (
                      <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold animate-pulse px-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>AI is checking your image for safety...</span>
                      </div>
                    )}
                    {commentImagePreview && (
                      <div className="relative w-20 h-20 mt-2">
                        <img src={commentImagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                        <button
                          onClick={() => { setCommentImage(null); setCommentImagePreview(null); }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {moderationError && (
                      <p className="text-red-500 text-xs mt-2">{moderationError}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>
        ))}

        {hasMore && (
          <button
            onClick={fetchMorePosts}
            disabled={isFetchingMore}
            className="w-full py-4 text-zinc-500 hover:text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
          >
            {isFetchingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load More Posts'}
          </button>
        )}

        {!hasMore && posts.length > 0 && (
          <p className="text-center py-8 text-zinc-600 text-sm italic">You've reached the end of the community feed.</p>
        )}

        {!loading && posts.length === 0 && (
          <div className="text-center py-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 border-dashed">
            <MessageSquare className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400 text-lg">No posts yet. Start the conversation!</p>
          </div>
        )}
      </div>
    </div>

    {/* Sidebar / Trending Section */}
      <div className="hidden lg:block space-y-8">
        {/* User Stats Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center gap-4 mb-6">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="" className="w-12 h-12 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <User className="w-6 h-6 text-zinc-500" />
              </div>
            )}
            <div>
              <p className="text-white font-bold">{profile?.displayName || 'User'}</p>
              <p className="text-zinc-500 text-xs">Level {profile?.level || 1}</p>
            </div>
          </div>
          <LevelProgress level={profile?.level || 1} xp={profile?.xp || 0} />
        </div>

        {/* Trending Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Trending Now
            </h3>
          </div>
          <div className="divide-y divide-zinc-800">
            {trendingPosts.slice(0, 5).map((post, index) => (
              <button
                key={post.id}
                onClick={() => {
                  const element = document.getElementById(post.id);
                  element?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full p-4 text-left hover:bg-zinc-800/50 transition-colors flex gap-3"
              >
                <span className="text-zinc-700 font-bold text-xl">0{index + 1}</span>
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold truncate">{post.title || post.content}</p>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">
                    {post.authorName} • {post.likesCount} likes
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Report Modal */}
      <AnimatePresence>
        {isReportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-red-500/10 rounded-2xl">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Report Post</h2>
                  <p className="text-zinc-400 text-sm">Help us understand what's wrong.</p>
                </div>
              </div>

              <div className="space-y-4">
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Why are you reporting this post? (e.g. Spam, Harassment, Inappropriate content...)"
                  className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsReportModalOpen(false);
                      setReportReason('');
                      setReportPostId(null);
                    }}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReportPost}
                    disabled={isSubmittingReport || !reportReason.trim()}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmittingReport ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Report'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Create Community Post</h2>
                <button onClick={() => setIsCreateModalOpen(false)} className="p-2 text-zinc-500 hover:text-white transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Title (Optional)</label>
                  <input
                    type="text"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    placeholder="Give your post a title..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Content</label>
                  <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="What's on your mind? (Paste a YouTube link here for a preview!)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white focus:outline-none focus:border-indigo-500/50 transition-all min-h-[150px] resize-none"
                  />
                </div>

                {extractLink(newPostContent) && getYoutubeId(extractLink(newPostContent)!) && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${getYoutubeId(extractLink(newPostContent)!)}`}
                      title="YouTube preview"
                      frameBorder="0"
                      className="w-full h-full pointer-events-none"
                    ></iframe>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Image</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                      <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input
                        type="text"
                        value={newPostImage}
                        onChange={(e) => {
                          setNewPostImage(e.target.value);
                          setSelectedFiles([]);
                          setImagePreviews([]);
                          setModerationError(null);
                        }}
                        onBlur={(e) => handleModerateUrl(e.target.value)}
                        placeholder="Paste Image URL..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-all text-sm"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={selectedFiles.length >= 5}
                        className={`w-full py-3 px-4 rounded-2xl border border-dashed flex items-center justify-center gap-2 transition-all text-sm font-bold ${
                          selectedFiles.length > 0 
                            ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' 
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {selectedFiles.length >= 5 ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                        {selectedFiles.length > 0 ? `${selectedFiles.length}/5 Images Selected` : 'Upload from Gallery'}
                      </button>
                    </div>
                  </div>
                </div>
                
                {(imagePreviews.length > 0 || newPostImage || isModerating || moderationError) && (
                  <div className="space-y-4">
                    {isModerating && (
                      <div className="flex items-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl animate-pulse">
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        <p className="text-indigo-400 text-sm font-bold">AI is checking your image for safety...</p>
                      </div>
                    )}
                    
                    {moderationError && (
                      <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                        <p className="text-red-500 text-sm font-bold">{moderationError}</p>
                      </div>
                    )}

                    {(imagePreviews.length > 0 || newPostImage) && (
                      <div className="grid grid-cols-3 gap-2">
                        {newPostImage && (
                          <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-square group">
                            <img src={newPostImage} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <button
                              onClick={() => setNewPostImage('')}
                              className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full transition-all hover:bg-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {imagePreviews.map((preview, idx) => (
                          <div key={idx} className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-square group">
                            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                            <button
                              onClick={() => removeImage(idx)}
                              className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full transition-all hover:bg-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleCreatePost}
                  disabled={isSubmitting || isModerating || !newPostContent.trim()}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {isSubmitting ? (selectedFiles.length > 0 ? 'Uploading Images...' : 'Posting...') : 'Post to Community'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}
