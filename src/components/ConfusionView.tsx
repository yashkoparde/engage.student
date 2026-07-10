/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Smile, HelpCircle, Frown, Users } from 'lucide-react';
import { ConfusionStats } from '../types.js';

interface StudentConfusionProps {
  currentVote: 'understood' | 'partial' | 'confused' | null;
  onVote: (level: 'understood' | 'partial' | 'confused') => void;
  disabled?: boolean;
}

export function StudentConfusionMeter({ currentVote, onVote, disabled = false }: StudentConfusionProps) {
  const options = [
    {
      level: 'understood' as const,
      label: 'Understood',
      icon: Smile,
      color: 'text-emerald-400',
      bgActive: 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      borderHover: 'hover:border-emerald-500/30 hover:bg-emerald-500/5',
    },
    {
      level: 'partial' as const,
      label: 'Partially Understood',
      icon: HelpCircle,
      color: 'text-orange-400',
      bgActive: 'bg-orange-500/15 border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.15)]',
      borderHover: 'hover:border-orange-500/30 hover:bg-orange-500/5',
    },
    {
      level: 'confused' as const,
      label: 'Confused',
      icon: Frown,
      color: 'text-red-400',
      bgActive: 'bg-red-500/15 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]',
      borderHover: 'hover:border-red-500/30 hover:bg-red-500/5',
    },
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3.5">
        {options.map((opt) => {
          const isActive = currentVote === opt.level;
          const Icon = opt.icon;

          return (
            <motion.button
              key={opt.level}
              whileHover={disabled ? {} : { y: -3, scale: 1.02 }}
              whileTap={disabled ? {} : { scale: 0.97 }}
              onClick={() => !disabled && onVote(opt.level)}
              disabled={disabled}
              className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 font-sans text-center ${
                isActive
                  ? opt.bgActive
                  : `bg-slate-900/40 border-slate-800/40 ${opt.borderHover} text-slate-400`
              } ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Icon className={`w-8 h-8 mb-3 ${isActive ? opt.color : 'text-slate-500'}`} />
              
              <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider ${isActive ? opt.color : 'text-slate-400'}`}>
                {opt.label}
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="text-[10px] font-sans text-slate-500 text-center uppercase tracking-widest mt-1">
        Tap anytime to update your instructor. One selection only.
      </p>
    </div>
  );
}

interface HostConfusionProps {
  stats: ConfusionStats;
}

export function HostConfusionMeter({ stats }: HostConfusionProps) {
  const total = stats.total || 0;
  
  const getPercent = (count: number) => {
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  const data = [
    {
      label: 'Understood',
      count: stats.understood,
      percent: getPercent(stats.understood),
      color: 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]',
      textColor: 'text-emerald-400',
    },
    {
      label: 'Partially Understood',
      count: stats.partial,
      percent: getPercent(stats.partial),
      color: 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]',
      textColor: 'text-orange-400',
    },
    {
      label: 'Confused',
      count: stats.confused,
      percent: getPercent(stats.confused),
      color: 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
      textColor: 'text-red-400',
    },
  ];

  return (
    <div className="w-full flex flex-col gap-5 p-5 bg-slate-950/30 rounded-2xl border border-slate-800/40">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-slate-200 tracking-wide">
          Comprehension Feedback Meter
        </h4>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono font-semibold text-slate-400">
          <Users className="w-3.5 h-3.5 text-blue-400" />
          <span>{total} active feedback votes</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {data.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300 font-sans">{item.label}</span>
              <div className="flex items-center gap-2 font-mono">
                <span className={item.textColor}>{item.percent}%</span>
                <span className="text-slate-500">({item.count} students)</span>
              </div>
            </div>

            {/* Glowing glass horizontal bar graph */}
            <div className="w-full h-3 rounded-full bg-slate-900/60 overflow-hidden border border-slate-800/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.percent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${item.color}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
