import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function Layout() {
  useEffect(() => {
    const incrementVisitor = async () => {
      try {
        const statsRef = doc(db, 'siteStats', 'global');
        await runTransaction(db, async (transaction) => {
          const statsDoc = await transaction.get(statsRef);
          if (!statsDoc.exists()) {
            transaction.set(statsRef, { visitorCount: 1 });
          } else {
            transaction.update(statsRef, { visitorCount: (statsDoc.data().visitorCount || 0) + 1 });
          }
        });
      } catch (error) {
        console.error('Error incrementing visitor count:', error);
      }
    };

    incrementVisitor();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
