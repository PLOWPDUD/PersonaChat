import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
