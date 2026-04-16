import React from 'react';
import { ShieldCheck } from 'lucide-react';

export function Rules() {
  const rules = [
    "1. Be respectful and kind to all community members.",
    "2. No hate speech, harassment, or bullying.",
    "3. Keep content appropriate for all ages.",
    "4. Do not impersonate other users or characters.",
    "5. Respect intellectual property and copyright.",
    "6. No spamming or excessive self-promotion.",
    "7. Use English for all public posts and comments.",
    "8. Report any suspicious or harmful activity.",
    "9. Follow all platform security and privacy guidelines.",
    "10. Have fun and enjoy the community!"
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 bg-zinc-900 border border-zinc-800 rounded-3xl">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-8 h-8 text-indigo-500" />
        <h1 className="text-3xl font-bold text-white">Community Rules</h1>
      </div>
      <ul className="space-y-4">
        {rules.map((rule, index) => (
          <li key={index} className="text-zinc-300 flex items-start gap-3">
            <span className="font-bold text-indigo-400">{index + 1}.</span>
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}
