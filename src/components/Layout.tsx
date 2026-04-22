import React, { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, X, MessageSquare } from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';
import { FeedbackPanel } from './FeedbackPanel';

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden h-16 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-white">
          <MessageSquare className="w-6 h-6 text-theme-primary" />
          <span>PersonaChat</span>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationCenter />
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-[70] w-64 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar 
          onClose={() => setIsSidebarOpen(false)} 
          onOpenFeedback={() => setIsFeedbackOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Header */}
        <header className="hidden lg:flex h-16 border-b border-zinc-800 items-center justify-end px-8 sticky top-0 bg-zinc-950/50 backdrop-blur-md z-40">
          <NotificationCenter />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <FeedbackPanel 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
      />
    </div>
  );
}
