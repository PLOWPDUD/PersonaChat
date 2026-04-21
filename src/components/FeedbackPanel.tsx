import React, { useState, useRef } from 'react';
import { X, Send, Bug, MessageSquare, Lightbulb, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { moderateImage, moderateText } from '../services/aiService';

interface FeedbackPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackPanel({ isOpen, onClose }: FeedbackPanelProps) {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState<'bug' | 'feedback' | 'suggestion'>('bug');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Image size must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // AI Moderation
      const textModeration = await moderateText(description);
      if (!textModeration.isAppropriate) {
        setError(`Description text moderated: ${textModeration.reason}. ${textModeration.suggestion}`);
        setIsSubmitting(false);
        return;
      }

      let imageUrl = null;
      if (image) {
        const mimeType = image.split(';')[0].split(':')[1];
        const base64Data = image.split(',')[1];
        const imageModeration = await moderateImage(base64Data, mimeType);
        
        if (!imageModeration.isAppropriate) {
          setError(`Image moderated: ${imageModeration.reason}. ${imageModeration.suggestion}`);
          setIsSubmitting(false);
          return;
        }
        // In this app, we often store images as base64 or external URLs. 
        // For feedback images, storing base64 might be okay if small, 
        // but let's assume we want to store it.
        imageUrl = image; 
      }

      await addDoc(collection(db, 'bug_reports'), {
        userId: user.uid,
        userName: profile?.displayName || 'Unknown User',
        userEmail: profile?.email || user.email || 'No Email',
        category,
        description,
        imageUrl,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setDescription('');
      setImage(null);
      onClose();
      alert('Thank you for your feedback! We will review it shortly.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bug_reports');
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Bug className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Support & Feedback</h2>
              <p className="text-xs text-zinc-500">Help us improve PersonaChat</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Category</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCategory('bug')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                  category === 'bug' 
                    ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <Bug className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase">Bug</span>
              </button>
              <button
                type="button"
                onClick={() => setCategory('feedback')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                  category === 'feedback' 
                    ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase">Feedback</span>
              </button>
              <button
                type="button"
                onClick={() => setCategory('suggestion')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                  category === 'suggestion' 
                    ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                <Lightbulb className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase">Idea</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe the issue or your suggestion in detail..."
              className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1">Attachment (Optional)</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group ${
                image ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/*"
                className="hidden" 
              />
              {image ? (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden">
                  <img src={image} alt="Preview" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImage(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500 rounded-lg text-white transition-all backdrop-blur-md"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-zinc-800 rounded-full text-zinc-400 group-hover:scale-110 group-hover:text-indigo-400 transition-all">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-zinc-300">Click to upload screenshot</p>
                    <p className="text-xs text-zinc-500">Max size: 2MB</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-zinc-800 bg-zinc-900/30">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !description.trim()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-600/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Moderating...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Submit Report
              </>
            )}
          </button>
          <p className="text-[10px] text-zinc-600 text-center mt-4 uppercase tracking-widest leading-relaxed">
            Submissions are moderated by AI. <br /> Inappropriate content will be rejected.
          </p>
        </div>
      </div>
    </div>
  );
}
