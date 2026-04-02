import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-4">
      <AlertTriangle className="w-16 h-16 text-zinc-600 mb-6" />
      <h1 className="text-4xl font-bold text-white mb-2">404 - Not Found</h1>
      <p className="text-zinc-400 mb-8 max-w-md">
        The page or character you're looking for doesn't exist or you don't have permission to view it.
      </p>
      <Link 
        to="/" 
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-xl transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
