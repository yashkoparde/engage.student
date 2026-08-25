/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Flame, CheckCircle, Award } from 'lucide-react';
import { Student } from '../types.js';

// Smooth counting animation for scores
function AnimatedScore({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const start = prevValueRef.current;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 1200; // ms
    const startTime = performance.now();

    let animationFrameId: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out quad
      const easeProgress = progress * (2 - progress);
      const current = start + (end - start) * easeProgress;
      setDisplayValue(parseFloat(current.toFixed(2)));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplayValue(end);
        prevValueRef.current = end;
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [value]);

  return <span className="font-mono">{displayValue.toFixed(2)}</span>;
}

// Animated fire streak badge next to each student's name
function StreakFlame({ streak }: { streak: number }) {
  const [animateKey, setAnimateKey] = useState(0);

  useEffect(() => {
    if (streak > 0) {
      setAnimateKey((prev) => prev + 1);
    }
  }, [streak]);

  if (streak <= 0) return null;

  return (
    <motion.span
      key={animateKey}
      initial={{ scale: 1 }}
      animate={animateKey > 0 ? {
        scale: [1, 1.5, 0.9, 1.15, 1],
        rotate: [0, -12, 14, -6, 0],
        filter: [
          'drop-shadow(0 0 2px rgba(239,68,68,0.5))',
          'drop-shadow(0 0 16px rgba(249,115,22,0.95))',
          'drop-shadow(0 0 4px rgba(249,115,22,0.6))',
          'drop-shadow(0 0 2px rgba(239,68,68,0.4))'
        ]
      } : {}}
      transition={{ duration: 0.65, ease: 'easeOut' }}
      className="inline-flex items-center gap-1 ml-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-red-500/15 to-orange-500/15 border border-orange-500/40 text-[10px] font-bold text-orange-400 select-none align-middle shadow-[0_0_10px_rgba(249,115,22,0.15)]"
    >
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
          y: [0, -1, 0]
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
      </motion.div>
      <motion.span 
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 15 }}
        className="font-mono font-extrabold text-orange-300"
      >
        {streak}
      </motion.span>
    </motion.span>
  );
}

interface LeaderboardViewProps {
  students: Array<Student & { rank: number }>;
  currentStudentId?: string | null;
  limit?: number;
}

export default function LeaderboardView({ students, currentStudentId, limit = 10 }: LeaderboardViewProps) {
  // Take top students to avoid rendering too many items in dense layout
  const displayedStudents = students.slice(0, limit);

  return (
    <div className="w-full flex flex-col gap-3">
      {displayedStudents.length === 0 ? (
        <div className="text-center py-10 text-slate-500 font-sans text-sm">
          No students are currently ranked. Wait for active participation!
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence mode="popLayout">
            {displayedStudents.map((student, idx) => {
              const isTop3 = student.rank <= 3;
              const isFirst = student.rank === 1;
              const isCurrent = student.id === currentStudentId;

              // Color classes based on rank
              let rankBg = 'bg-slate-800/50';
              let borderClass = 'border-slate-800/40';
              let rankTextClass = 'text-slate-400';
              let medalIcon = null;

              if (student.rank === 1) {
                rankBg = 'bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-transparent';
                borderClass = 'border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]';
                rankTextClass = 'text-amber-400 font-bold';
                medalIcon = <Trophy className="w-4 h-4 text-amber-400 fill-amber-400/20 animate-bounce" />;
              } else if (student.rank === 2) {
                rankBg = 'bg-gradient-to-r from-slate-400/10 via-slate-500/5 to-transparent';
                borderClass = 'border-slate-400/20';
                rankTextClass = 'text-slate-300 font-bold';
                medalIcon = <Trophy className="w-4 h-4 text-slate-300 fill-slate-300/10" />;
              } else if (student.rank === 3) {
                rankBg = 'bg-gradient-to-r from-amber-700/10 via-amber-800/5 to-transparent';
                borderClass = 'border-amber-700/20';
                rankTextClass = 'text-amber-600 font-bold';
                medalIcon = <Trophy className="w-4 h-4 text-amber-600 fill-amber-700/10" />;
              }

              if (isCurrent) {
                borderClass = 'border-blue-500/50 ring-1 ring-blue-500/20';
              }

              return (
                <motion.div
                  key={student.id}
                  layoutId={student.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 24,
                    mass: 0.8,
                  }}
                  className={`relative flex items-center justify-between p-3.5 rounded-2xl border ${borderClass} ${rankBg} transition-all duration-300 overflow-hidden`}
                >
                  {/* Glowing aura for first place */}
                  {isFirst && (
                    <div className="absolute inset-0 bg-radial-gradient from-amber-500/5 to-transparent pointer-events-none" />
                  )}

                  <div className="flex items-center gap-3.5 z-10">
                    {/* Rank indicator */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-950/40 border border-slate-800/60">
                      {medalIcon ? (
                        <div className="relative">
                          {medalIcon}
                        </div>
                      ) : (
                        <span className={`font-mono text-xs font-semibold ${rankTextClass}`}>
                          {student.rank}
                        </span>
                      )}
                    </div>

                    {/* Student Name */}
                    <div className="flex flex-col">
                      <span className={`font-sans text-sm font-semibold tracking-wide ${isCurrent ? 'text-blue-400' : 'text-slate-100'} flex items-center flex-wrap gap-1`}>
                        <span>{student.name}</span>
                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 font-bold text-blue-400 uppercase tracking-wider">
                            You
                          </span>
                        )}
                        <StreakFlame streak={student.streak} />
                      </span>
                      {/* Subtitle details */}
                      <div className="flex items-center gap-2.5 mt-1">
                        <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500/70" />
                          <span>{student.correctCount} correct</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2.5 z-10">
                    <div className="flex flex-col items-end">
                      <div className="text-sm font-bold text-slate-100 tracking-tight">
                        <AnimatedScore value={student.score} />
                      </div>
                      <span className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-widest">
                        pts
                      </span>
                    </div>

                    {/* Medal visual tag */}
                    {isTop3 && (
                      <div className={`p-1 rounded-lg ${
                        student.rank === 1 ? 'bg-amber-500/10 text-amber-400' :
                        student.rank === 2 ? 'bg-slate-400/10 text-slate-300' :
                        'bg-amber-700/10 text-amber-600'
                      }`}>
                        <Award className="w-3.5 h-3.5 fill-current/10" />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
