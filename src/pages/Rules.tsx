import React from 'react';
import { ShieldCheck, MessageSquare, AlertTriangle, EyeOff, Scale, Heart, Info, ChevronRight, Gavel, HandMetal, Ghost, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Rules() {
  const { profile, updateSeenRules } = useAuth();
  const navigate = useNavigate();

  const handleAccept = async () => {
    await updateSeenRules();
    navigate('/');
  };

  const ruleGroups = [
    {
      title: "Core Conduct",
      icon: Heart,
      color: "text-rose-400",
      description: "How we interact as a community.",
      rules: [
        { name: "Respect First", text: "Treat every user and AI personality with basic human dignity. Harassment, hate speech, and bullying are strictly prohibited." },
        { name: "No Toxic Content", text: "Prohibited content includes extremist ideologies, illegal activities, and glorification of self-harm." },
        { name: "Age Appropriate", text: "This platform is intended for users 13+. Keep public characters and community posts broadly appropriate." }
      ]
    },
    {
      title: "Creation Guidelines",
      icon: Scale,
      color: "text-indigo-400",
      description: "Standards for AI characters and personas.",
      rules: [
        { name: "Public Safety", text: "Public characters must NOT encourage violence, non-consensual sexual content, or dangerous illegal behaviors." },
        { name: "No Impersonation", text: "Do not create characters to maliciously impersonate real living figures for fraud or targeted harassment." },
        { name: "Intellectual Property", text: "Respect the copyrights of artists and authors. AI prompts should not be used to bypass proprietary protections." }
      ]
    },
    {
      title: "Technical Use",
      icon: Gavel,
      color: "text-amber-400",
      description: "App usage and bot behavior.",
      rules: [
        { name: "Spam & Manipulation", text: "No mass-creation of accounts or characters to manipulate ratings, level systems, or community rankings." },
        { name: "System Integrity", text: "Do not attempt to scrape private database information or exploit LLM vulnerabilities for malicious extraction." },
        { name: "English Primary", text: "While multi-lingual chat is supported, public character descriptions and community comments must be in English for moderation." }
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
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter">Community Baseline</h1>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
          These rules ensure PersonaChat remains a creative, safe, and innovative space for everyone.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-2xl">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-white font-bold">Zero Tolerance</h3>
            <p className="text-xs text-zinc-500">Hate speech or harassment results in immediate bans.</p>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-2xl">
            <EyeOff className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-white font-bold">Privacy Lock</h3>
            <p className="text-xs text-zinc-500">Private characters are never shared with anyone.</p>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-2xl">
            <HandMetal className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h3 className="text-white font-bold">Creative Freedom</h3>
            <p className="text-xs text-zinc-500">We prioritize expression within safety bounds.</p>
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
          <h2 className="text-3xl font-black text-white leading-tight">By continuing to use PersonaChat, you agree to these standards.</h2>
          <p className="text-indigo-100 mt-4 font-medium italic opacity-80">We reserve the right to remove any content that violates these principles.</p>
        </div>
        
        {profile && profile.hasSeenRules === false && (
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={handleAccept}
            className="mt-8 bg-white text-indigo-600 hover:bg-zinc-100 font-bold py-4 px-10 rounded-2xl shadow-xl hover:scale-105 transition-all flex items-center gap-3 mx-auto"
          >
            <CheckCircle2 className="w-6 h-6" />
            I Understand & Accept
          </motion.button>
        )}
      </footer>
    </div>
  );
}
