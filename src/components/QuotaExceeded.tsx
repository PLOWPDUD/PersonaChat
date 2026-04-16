import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { QuotaResetTimer } from './QuotaResetTimer';

export const QuotaExceeded = () => (
  <div className="flex flex-col items-center justify-center p-8 text-center bg-red-50 rounded-lg border border-red-200">
    <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
    <h2 className="text-xl font-semibold text-red-800">Service Temporarily Unavailable</h2>
    <p className="text-red-600 mt-2 max-w-md">
      We've hit our daily usage limit for the free tier. Please check back later or contact the administrator to enable billing.
    </p>
    <div className="mt-6 p-4 bg-white/50 rounded-xl border border-red-100">
      <p className="text-sm text-red-800 font-medium">
        💡 Tip: You can "Remix" this app from the AI Studio menu to get a fresh project with a new quota!
      </p>
    </div>
    <QuotaResetTimer />
  </div>
);
