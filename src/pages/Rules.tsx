import React from 'react';
import { ShieldCheck, MessageSquare, AlertTriangle, EyeOff, Scale, Heart, Info, ChevronRight, Gavel, HandMetal, Ghost, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Rules() {
  const { t } = useTranslation();
  const { profile, updateSeenRules } = useAuth();
  const navigate = useNavigate();

  const handleAccept = async () => {
    await updateSeenRules();
    navigate('/');
  };

  const ruleGroups = [
    {
      title: t('rules.conduct'),
      icon: Heart,
      color: "text-rose-400",
      description: t('rules.conductDesc'),
      rules: [
        { name: t('rules.respect'), text: t('rules.respectDesc') },
        { name: t('rules.noToxic'), text: t('rules.noToxicDesc') },
        { name: t('rules.age'), text: t('rules.ageDesc') }
      ]
    },
    {
      title: t('rules.creation'),
      icon: Scale,
      color: "text-indigo-400",
      description: t('rules.creationDesc'),
      rules: [
        { name: t('rules.safety'), text: t('rules.safetyDesc') },
        { name: t('rules.noImpersonation'), text: t('rules.noImpersonationDesc') },
        { name: t('rules.ip'), text: t('rules.ipDesc') }
      ]
    },
    {
      title: t('rules.technical'),
      icon: Gavel,
      color: "text-amber-400",
      description: t('rules.technicalDesc'),
      rules: [
        { name: t('rules.spam'), text: t('rules.spamDesc') },
        { name: t('rules.integrity'), text: t('rules.integrityDesc') },
        { name: t('rules.english'), text: t('rules.englishDesc') }
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <header className="text-center space-y-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex p-4 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 mb-4"
        >
          <ShieldCheck className="w-12 h-12 text-indigo-500" />
        </motion.div>
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter">{t('common.rulesTitle')}</h1>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
          {t('common.rulesSub')}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-2xl">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-white font-bold">{t('rules.zeroTolerance')}</h3>
            <p className="text-xs text-zinc-500">{t('rules.zeroToleranceDesc')}</p>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-2xl">
            <EyeOff className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-white font-bold">{t('rules.privacy')}</h3>
            <p className="text-xs text-zinc-500">{t('rules.privacyDesc')}</p>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-2xl">
            <HandMetal className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h3 className="text-white font-bold">{t('rules.freedom')}</h3>
            <p className="text-xs text-zinc-500">{t('rules.freedomDesc')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {ruleGroups.map((group, gIdx) => (
          <motion.section 
            key={group.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: gIdx * 0.1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-zinc-800 flex flex-col md:flex-row md:items-center gap-6 bg-zinc-900/50">
              <div className={`p-4 rounded-2xl bg-zinc-950 border border-zinc-800 ${group.color}`}>
                <group.icon className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white">{group.title}</h2>
                <p className="text-zinc-500">{group.description}</p>
              </div>
            </div>
            
            <div className="p-2">
              {group.rules.map((rule, rIdx) => (
                <div 
                  key={rule.name}
                  className={`p-6 rounded-3xl hover:bg-zinc-800/50 transition-colors group ${rIdx !== group.rules.length - 1 ? 'border-b border-zinc-800/50 mb-1' : ''}`}
                >
                  <div className="flex gap-4">
                    <div className="font-mono text-zinc-600 text-sm mt-1">0{rIdx + 1}</div>
                    <div className="flex-1">
                      <h4 className="text-white font-bold mb-1 group-hover:text-indigo-400 transition-colors">{rule.name}</h4>
                      <p className="text-zinc-400 text-sm leading-relaxed">{rule.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      <footer className="p-10 bg-indigo-600 rounded-[3rem] text-center space-y-6 shadow-xl shadow-indigo-900/20">
        <Ghost className="w-12 h-12 text-white/50 mx-auto" />
        <div className="max-w-md mx-auto">
          <h2 className="text-3xl font-black text-white leading-tight">{t('common.rulesFooter')}</h2>
          <p className="text-indigo-100 mt-4 font-medium italic opacity-80">{t('rules.footerSub')}</p>
        </div>
        
        {profile && profile.hasSeenRules === false && (
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={handleAccept}
            className="mt-8 bg-white text-indigo-600 hover:bg-zinc-100 font-bold py-4 px-10 rounded-2xl shadow-xl hover:scale-105 transition-all flex items-center gap-3 mx-auto"
          >
            <CheckCircle2 className="w-6 h-6" />
            {t('common.rulesAccept')}
          </motion.button>
        )}
      </footer>
    </div>
  );
}
