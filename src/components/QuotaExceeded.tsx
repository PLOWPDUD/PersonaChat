import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const QuotaExceeded = () => {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900 rounded-3xl border border-zinc-800 shadow-2xl max-w-md mx-auto">
      <div className="p-4 bg-amber-500/10 rounded-full mb-6">
        <ShieldAlert className="w-12 h-12 text-amber-500" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-3">Service Temporarily Unavailable</h2>
      <p className="text-zinc-400 mb-8 leading-relaxed">
        {t('common.quotaLimitDesc', "We've hit our daily usage limit for the free tier. The app will return to normal operation once the quota resets.")}
      </p>
      
      <div className="space-y-4 w-full">
        <button 
          onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
        >
          <RefreshCw className="w-5 h-5" />
          {t('common.btnReset', 'Try Reloading')}
        </button>
        
        <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
          <p className="text-xs text-zinc-500 font-medium leading-relaxed">
            <span className="text-amber-500 font-bold block mb-1">💡 PRO TIP</span>
            You can "Remix" this app from the AI Studio menu to get a fresh project with its own full daily quota!
          </p>
        </div>
      </div>
    </div>
  );
};
