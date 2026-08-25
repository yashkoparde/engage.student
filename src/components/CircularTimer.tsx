/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';

interface CircularTimerProps {
  timeRemaining: number;
  timeLimit: number;
}

export default function CircularTimer({ timeRemaining, timeLimit }: CircularTimerProps) {
  const percentage = Math.max(0, Math.min(100, (timeRemaining / timeLimit) * 100));
  
  // Define colors based on urgency
  let strokeColor = 'stroke-blue-500';
  let glowColor = 'shadow-[0_0_15px_rgba(59,130,246,0.3)]';
  let textColor = 'text-blue-400';
  let glowTextClass = 'text-glow';

  if (timeRemaining <= 3) {
    strokeColor = 'stroke-red-500';
    glowColor = 'shadow-[0_0_20px_rgba(239,68,68,0.5)]';
    textColor = 'text-red-500';
    glowTextClass = 'text-glow-red';
  } else if (timeRemaining <= Math.max(5, timeLimit * 0.3)) {
    strokeColor = 'stroke-orange-500';
    glowColor = 'shadow-[0_0_15px_rgba(249,115,22,0.4)]';
    textColor = 'text-orange-500';
    glowTextClass = 'text-glow-orange';
  }

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * percentage) / 100;

  return (
    <div className="relative flex flex-col items-center justify-center w-24 h-24 select-none">
      {/* Outer Ring Ambient Glow */}
      <div className={`absolute inset-0.5 rounded-full transition-shadow duration-300 pointer-events-none ${glowColor}`} />

      <svg className="absolute w-full h-full transform -rotate-90">
        {/* Background Track */}
        <circle
          cx="48"
          cy="48"
          r={radius}
          className="stroke-slate-800/80 fill-slate-950/85"
          strokeWidth="4"
        />
        {/* Animated Active Track */}
        <motion.circle
          cx="48"
          cy="48"
          r={radius}
          className={`fill-none ${strokeColor}`}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset }}
          transition={{
            duration: 1,
            ease: 'linear',
          }}
        />
      </svg>

      {/* Countdown Timer Text */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        <motion.span
          key={timeRemaining}
          initial={{ scale: 0.85, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className={`font-mono text-2xl font-bold ${textColor} ${glowTextClass}`}
        >
          {timeRemaining}
        </motion.span>
        <span className="text-[9px] font-sans text-slate-500 font-medium tracking-wide uppercase">
          secs
        </span>
      </div>
    </div>
  );
}
