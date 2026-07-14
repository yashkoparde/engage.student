/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, 
  Users, 
  BookOpen, 
  ChevronRight, 
  RotateCcw,
  Sparkles,
  Award,
  Flame,
  FileText,
  Lock,
  MessageCircle,
  ThumbsUp,
  ChevronUp,
  TrendingUp,
  Send,
  Mic,
  Clock
} from 'lucide-react';
import CircularTimer from './CircularTimer.js';
import LeaderboardView from './LeaderboardView.js';
import { StudentConfusionMeter } from './ConfusionView.js';
import { SyncStatePayload } from '../types.js';
import { 
  isSupabaseConfigured, 
  joinRoomSupabase, 
  submitAnswerSupabase, 
  submitConfusionSupabase,
  submitPollVoteSupabase,
  submitQaQuestionSupabase,
  upvoteQaQuestionSupabase,
  updateStudentPointsSupabase,
  submitSpeedtyperRecordSupabase
} from '../lib/supabase.js';

interface StudentViewProps {
  socket: any;
  syncState: SyncStatePayload | null;
  onJoinSuccess: (roomCode: string, studentId: string, name: string) => void;
  savedRoomCode?: string;
  savedStudentId?: string;
  savedName?: string;
}

const toastVariants = {
  initial: { opacity: 0, y: 50, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 350, damping: 25 }
  },
  vibrate: {
    x: [0, -6, 6, -6, 6, -3, 3, -1, 1, 0],
    transition: { duration: 0.35, ease: 'easeInOut', delay: 0.15 }
  },
  exit: { opacity: 0, y: 20, scale: 0.9, transition: { duration: 0.15 } }
};

export default function StudentView({ 
  socket, 
  syncState, 
  onJoinSuccess,
  savedRoomCode = '',
  savedStudentId = '',
  savedName = ''
}: StudentViewProps) {
  // Local Join Form states
  const [roomCode, setRoomCode] = useState(savedRoomCode);
  const [studentName, setStudentName] = useState(savedName);
  const [errorMsg, setErrorMsg] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Active MCQ / Fastest Finger States
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [fastestFingerText, setFastestFingerText] = useState<string>('');
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLockedToast, setShowLockedToast] = useState(false);

  // Active Poll States
  const [isVoting, setIsVoting] = useState(false);

  // Speedtyper Seminar Arena States
  const [seminarText, setSeminarText] = useState('');
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: number; char: string; left: number }>>([]);

  // Active Flashcards States
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // Speed Typer Game States
  const [typedText, setTypedText] = useState('');
  const [speedtyperStartTime, setSpeedtyperStartTime] = useState<number | null>(null);
  const [speedtyperEndTime, setSpeedtyperEndTime] = useState<number | null>(null);
  const [isSpeedtyperSubmitted, setIsSpeedtyperSubmitted] = useState(false);
  const [speedtyperSubmitting, setSpeedtyperSubmitting] = useState(false);
  const [speedtyperResult, setSpeedtyperResult] = useState<{ wpm: number; accuracy: number; time: number } | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);

  // Sync state reset on activity launch
  useEffect(() => {
    if (syncState?.state === 'launcher' || syncState?.state === 'active') {
      setSelectedAnswer('');
      setFastestFingerText('');
      
      const activeQuest = syncState.activeActivity?.question || '';
      const wasAnsweredLocally = activeQuest ? localStorage.getItem(`engage_answered_${syncState.roomCode}_${activeQuest}`) === 'true' : false;
      
      setSubmissionLocked(wasAnsweredLocally || !!syncState.studentSubmission);
    } else {
      setSubmissionLocked(false);
    }
    // Also reset flip card status on new activities
    setIsCardFlipped(false);
  }, [syncState?.state, syncState?.currentActivityIndex, syncState?.studentSubmission, syncState?.activeActivity?.question]);

  // Reset speedtyper game state when we enter or leave the speedtyper active presenter view
  useEffect(() => {
    if (syncState?.state === 'speedtyper') {
      setTypedText('');
      setSpeedtyperStartTime(null);
      setSpeedtyperEndTime(null);
      setIsSpeedtyperSubmitted(false);
      setSpeedtyperSubmitting(false);
      setSpeedtyperResult(null);
      setElapsedSecs(0);
    }
  }, [syncState?.state]);

  // Real-time ticking stopwatch for Speed Typer game
  useEffect(() => {
    let interval: any = null;
    if (speedtyperStartTime && !speedtyperEndTime) {
      interval = setInterval(() => {
        setElapsedSecs(parseFloat(((Date.now() - speedtyperStartTime) / 1000).toFixed(1)));
      }, 100);
    } else if (!speedtyperStartTime) {
      setElapsedSecs(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [speedtyperStartTime, speedtyperEndTime]);

  // Client-authoritative scoring engine
  useEffect(() => {
    const isRevealed = syncState?.state === 'revealed' || syncState?.activityStatus === 'revealed';
    if (isRevealed && syncState?.activeActivity && syncState?.student && syncState?.studentSubmission) {
      const activityId = syncState.activeActivity.id || String(syncState.currentActivityIndex);
      const storageKey = `aura_scored_${syncState.roomCode}_${activityId}`;
      const alreadyScored = localStorage.getItem(storageKey) === 'true';

      if (!alreadyScored) {
        // Mark as scored immediately
        localStorage.setItem(storageKey, 'true');
        
        const isCorrect = syncState.studentSubmission.isCorrect;
        const pointsToAdd = 15; // Standard +15 points for correct response!
        
        updateStudentPointsSupabase(syncState.student.id, pointsToAdd, isCorrect)
          .then((res) => {
            if (res.success) {
              console.log(`[Scoring Engine] Tally synchronized. Correct: ${isCorrect}, +${isCorrect ? pointsToAdd : 0} pts.`);
            } else {
              console.warn('[Scoring Engine] Failed to sync points to database:', res.error);
            }
          });
      }
    }
  }, [syncState?.state, syncState?.activityStatus, syncState?.currentActivityIndex, syncState?.studentSubmission]);

  // Auto-dismiss the Answer Locked Toast notification after 3.5 seconds
  useEffect(() => {
    if (showLockedToast) {
      const timer = setTimeout(() => {
        setShowLockedToast(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [showLockedToast]);

  // Spawn visual claps or positive emojis that float upwards
  const handleSpawnReaction = (char: string) => {
    const id = Date.now() + Math.random();
    const item = { id, char, left: Math.floor(Math.random() * 80) + 10 };
    setFloatingReactions(prev => [...prev, item]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(x => x.id !== id));
    }, 2000);
  };

  // Join Room Handler
  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!roomCode.trim() || !studentName.trim()) {
      setErrorMsg('Please enter both Room Code and your Name.');
      return;
    }

    setIsJoining(true);
    setErrorMsg('');

    if (isSupabaseConfigured()) {
      try {
        const res = await joinRoomSupabase(roomCode.trim().toUpperCase(), studentName.trim(), savedStudentId);
        setIsJoining(false);
        if (res.success && res.studentId && res.roomCode && res.name) {
          onJoinSuccess(res.roomCode, res.studentId, res.name);
        } else {
          setErrorMsg(res.error || 'Failed to join the room.');
        }
      } catch (err: any) {
        setIsJoining(false);
        setErrorMsg(err.message || 'Failed to join classroom.');
      }
    } else {
      socket.emit(
        'student:join_room',
        { roomCode: roomCode.trim().toUpperCase(), name: studentName.trim() },
        (res: { success: boolean; studentId?: string; name?: string; roomCode?: string; error?: string }) => {
          setIsJoining(false);
          if (res.success && res.studentId && res.roomCode && res.name) {
            onJoinSuccess(res.roomCode, res.studentId, res.name);
          } else {
            setErrorMsg(res.error || 'Failed to join the room.');
          }
        }
      );
    }
  };

  // Student answer lock submit handler
  const handleSubmitAnswer = async (answerVal: string) => {
    if (!answerVal || !answerVal.trim()) return;
    setIsSubmitting(true);

    if (isSupabaseConfigured() && syncState?.student) {
      try {
        const optionIndex = ['A', 'B', 'C', 'D'].indexOf(answerVal.toUpperCase());
        const fullOptionText = optionIndex >= 0 && activeActivity?.options ? activeActivity.options[optionIndex] : '';

        const isCorrect = activeActivity?.correctAnswer 
          ? (
              answerVal.trim().toLowerCase() === activeActivity.correctAnswer.trim().toLowerCase() ||
              (fullOptionText && fullOptionText.trim().toLowerCase() === activeActivity.correctAnswer.trim().toLowerCase())
            )
          : false;

        const elapsedMs = activeActivity 
          ? Math.max(0, (activeActivity.timeLimit - (syncState.timeRemaining || 0)) * 1000) 
          : 0;

        const res = await submitAnswerSupabase(
          syncState.roomCode,
          syncState.student.id,
          syncState.student.name,
          answerVal,
          isCorrect,
          elapsedMs,
          activeActivity?.id || 'current_check'
        );
        setIsSubmitting(false);
        if (res.success) {
          const activeQuest = activeActivity?.question || '';
          if (activeQuest) {
            localStorage.setItem(`engage_answered_${syncState.roomCode}_${activeQuest}`, 'true');
          }
          setSubmissionLocked(true);
          setShowLockedToast(true);
        } else {
          setErrorMsg(res.error || 'Failed to lock your response.');
        }
      } catch (err: any) {
        setIsSubmitting(false);
        setErrorMsg(err.message || 'Error occurred while submitting.');
      }
    } else {
      socket.emit(
        'student:submit_answer',
        { roomCode: syncState?.roomCode, studentId: syncState?.student?.id, answer: answerVal },
        (res: { success: boolean; error?: string }) => {
          setIsSubmitting(false);
          if (res.success) {
            const activeQuest = activeActivity?.question || '';
            if (activeQuest) {
              localStorage.setItem(`engage_answered_${syncState?.roomCode}_${activeQuest}`, 'true');
            }
            setSubmissionLocked(true);
            setShowLockedToast(true);
          } else {
            setErrorMsg(res.error || 'Submission check failed.');
          }
        }
      );
    }
  };

  // Real-time live pace/confusion level handler
  const handleConfusionVote = async (level: 'understood' | 'partial' | 'confused') => {
    if (!syncState?.student) return;
    if (isSupabaseConfigured()) {
      await submitConfusionSupabase(syncState.roomCode, syncState.student.id, level);
    } else {
      socket.emit('student:submit_confusion', { roomCode: syncState.roomCode, studentId: syncState.student.id, level });
    }
  };

  // Poll Survey Vote Handler
  const handleVoteInPoll = async (optionIndex: number) => {
    if (!syncState?.activePoll || !syncState?.roomCode) return;
    setIsVoting(true);
    
    const poll = syncState.activePoll;
    const res = await submitPollVoteSupabase(
      syncState.roomCode,
      poll.id,
      optionIndex,
      poll.votes || {},
      poll.totalVotes || 0
    );
    
    setIsVoting(false);
    if (res.success) {
      localStorage.setItem(`voted_poll_${poll.id}`, 'true');
    }
  };

  // Mock scan helper
  const handleMockScan = () => {
    setRoomCode('CS302');
    setStudentName('Alex Mercer');
  };

  // Render Section 1: SIGN IN LOBBY (Pure Student View)
  if (!syncState) {
    return (
      <div className="w-full max-w-md mx-auto p-4 flex flex-col justify-center min-h-[85vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key="login-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="glass-card rounded-3xl p-6 sm:p-8 border border-white/[0.04] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden"
          >
            {/* Top custom gradients */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-600/10 to-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Glowing Logo Header */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] mb-4">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-white">Engage</h1>
              <p className="text-xs text-slate-400 font-sans mt-1">Real-time Classroom Companion</p>
            </div>

            <form onSubmit={handleJoin} className="space-y-5">
              {/* Room Code */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Active Room Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Enter Room (e.g., CS302)"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-4 font-mono text-sm tracking-widest text-center text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all uppercase"
                    disabled={isJoining}
                  />
                </div>
              </div>

              {/* Student Name */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Your Handle (Name)
                </label>
                <input
                  type="text"
                  maxLength={25}
                  placeholder="Enter Name or Handle"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-4 font-sans text-sm text-center text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  disabled={isJoining}
                />
              </div>

              {/* Error Feedbacks */}
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400 text-center font-sans"
                >
                  {errorMsg}
                </motion.div>
              )}

              {/* Join Submit */}
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isJoining}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isJoining ? 'Connecting...' : 'Secure Join ➔'}
              </motion.button>
            </form>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  const { state, subject, teacherName, roomCode: joinedCode, studentsCount, activeActivity, student, studentSubmission } = syncState;

  // Render Live Classroom Sections (with real-time state synchronization matching presenter active view)
  if (state !== 'ended') {
    const isLobby = state === 'lobby' || state === 'waiting';
    const isOverview = state === 'overview';
    const isIdle = state === 'idle';
    const isMcqLauncher = state === 'launcher' || state === 'active' || state === 'revealed';
    const isPolls = state === 'polls';
    const isSpeedtyper = state === 'speedtyper';
    const isFlashcards = state === 'flashcards';
    const isQaTab = state === 'qa';
    const isLeaderboard = state === 'leaderboard';

    const activeQuest = syncState?.activeActivity?.question || '';
    const wasAnsweredLocally = activeQuest ? localStorage.getItem(`engage_answered_${syncState.roomCode}_${activeQuest}`) === 'true' : false;
    const isLocked = submissionLocked || wasAnsweredLocally || !!studentSubmission;

    return (
      <div className="w-full max-w-2xl mx-auto p-2 flex flex-col gap-6 relative">
        
        {/* Floating animated reactions (Upward bubbles for seminar spectator claps) */}
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          <AnimatePresence>
            {floatingReactions.map(rect => (
              <motion.div
                key={rect.id}
                initial={{ opacity: 0.8, y: '80vh', scale: 0.8 }}
                animate={{ opacity: 0, y: '10vh', scale: 1.5, x: Math.sin(rect.id) * 30 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.8, ease: 'easeOut' }}
                style={{ left: `${rect.left}%` }}
                className="absolute text-3xl select-none filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
              >
                {rect.char}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* PERSISTENT CLASS INFO HEADER */}
        <div className="w-full bg-slate-950/40 border border-white/[0.03] p-4 rounded-2xl flex items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                Course Subject
              </span>
              <h3 className="text-sm font-bold text-white font-sans">{subject}</h3>
            </div>
          </div>

          <div className="flex flex-col text-right">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
              Professor
            </span>
            <span className="text-xs font-semibold text-slate-300 font-sans">{teacherName}</span>
          </div>
        </div>
        
        {/* VIEW 1A: LOBBY STATE */}
        {isLobby && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden"
          >
            {/* Animated glowing backdrop */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Pulsing radar waiting core */}
            <div className="flex justify-center mb-6 relative">
              <div className="absolute w-24 h-24 bg-violet-500/5 rounded-full border border-violet-500/10 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute w-16 h-16 bg-violet-500/10 rounded-full border border-violet-500/20 animate-pulse" />
              <div className="relative w-12 h-12 bg-violet-500/20 border border-violet-500/30 rounded-2xl flex items-center justify-center text-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                <Users className="w-5 h-5 animate-pulse" />
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-800/80 text-xs font-mono mb-5">
              <span className="text-slate-500 font-semibold">Room Code:</span>
              <span className="text-indigo-400 font-bold tracking-wider">{joinedCode}</span>
            </div>

            <h2 className="font-display text-2xl font-bold text-white mb-2">Classroom Lobby</h2>
            <p className="text-sm text-slate-400 font-sans max-w-md mx-auto mb-6">
              You're successfully connected to the classroom! Please wait while <span className="text-slate-200 font-semibold">{teacherName || 'your professor'}</span> prepares the lecture dashboard.
            </p>

            <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 mb-6 flex items-center justify-between text-left max-w-sm mx-auto">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-300">Your Student Handle:</span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1 rounded-lg">
                {student?.name || studentName || 'Student'}
              </span>
            </div>

            <div className="flex items-center justify-center gap-2 mb-4 pt-4 border-t border-slate-800/30">
              <Users className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-slate-400 font-sans font-medium">
                <span className="text-indigo-400 font-bold font-mono">{studentsCount}</span> classmates connected in lobby
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 mt-4">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                Waiting for host to launch active task...
              </p>
            </div>
          </motion.div>
        )}

        {/* VIEW 1B: OVERVIEW STATE */}
        {isOverview && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden"
          >
            {/* Ambient lighting */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-6 border-b border-slate-800/60 pb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white">Lecture Overview</h3>
                <p className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase">Live Comprehension & Pace Check</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-900/30 border border-slate-800/40 rounded-2xl p-4">
                <p className="text-sm text-slate-300 font-sans leading-relaxed">
                  Welcome to <span className="text-white font-semibold">{subject}</span>! Use the real-time compression meter below to instantly notify the instructor on how well you are processing the presented content.
                </p>
              </div>

              {/* Three live compression buttons ('understood', 'partial', 'confused') */}
              <div className="space-y-3">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block text-center">
                  Live Compression Feedback (Pace check)
                </span>
                <StudentConfusionMeter 
                  currentVote={syncState.studentConfusionVote} 
                  onVote={handleConfusionVote} 
                />
              </div>

              <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-800/30">
                <Users className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400 font-sans font-medium">
                  Join <span className="text-emerald-400 font-bold font-mono">{studentsCount}</span> classmates in syncing interactive learning feedback!
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 2: LECTURE IDLE STATE */}
        {isIdle && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-6 text-center"
          >
            <div className="w-14 h-14 mx-auto bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-5 animate-pulse">
              <Users className="w-7 h-7" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">Lecture Stream Active</h3>
            <p className="text-sm text-slate-400 font-sans max-w-[280px] mx-auto mb-6">
              Keep this screen open. Your instructor will launch the next interaction momentarily.
            </p>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/40 text-left mb-6">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                <span>Student Profile</span>
                <span className="text-indigo-400 font-bold">Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-sans font-semibold text-slate-200">{student?.name}</span>
                <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded border border-indigo-400/20">
                  ⚡ Score: {student?.score || '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-800/40 text-[10px] text-slate-500 font-mono">
                <span>Learning Pace Status:</span>
                <span className="capitalize text-slate-300 font-bold">
                  {syncState.studentConfusionVote || 'No vote selected yet'}
                </span>
              </div>
            </div>

            {/* Quick in-screen Pace Modifier */}
            <div className="my-4 text-left border-t border-slate-800/40 pt-4">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-3 text-center">
                Modify comprehend speed indicator
              </span>
              <StudentConfusionMeter 
                currentVote={syncState.studentConfusionVote} 
                onVote={handleConfusionVote} 
              />
            </div>

            <div className="flex justify-center items-center gap-1.5 text-[10px] font-mono tracking-widest text-slate-500 uppercase pt-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Synchronized with Presenter</span>
            </div>
          </motion.div>
        )}

        {/* VIEW 3: STREAMED MCQ CHECKPOINT ARENA */}
        {isMcqLauncher && (
          <div className="flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-4 rounded-2xl flex items-center justify-between gap-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest">
                  Live Interactive Checkpoint
                </span>
                <h4 className="font-sans text-xs font-semibold text-slate-300 truncate max-w-[200px] sm:max-w-md">
                  ⚡ Multiple Choice MCQ Arena
                </h4>
              </div>

              {(state === 'active' || state === 'launcher') && activeActivity && (
                <CircularTimer 
                  timeRemaining={syncState.timeRemaining} 
                  timeLimit={activeActivity.timeLimit} 
                />
              )}

              {state === 'revealed' && (
                <div className="px-3 py-1 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold font-mono text-red-400 uppercase tracking-wide">
                  Closed / Locked
                </div>
              )}
            </motion.div>

            <AnimatePresence mode="wait">
              {!isLocked && (state === 'active' || state === 'launcher') ? (
                <motion.div
                  key="mcq-workspace"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="glass-card rounded-3xl p-6 sm:p-8"
                >
                  <h3 className="font-display text-lg font-semibold text-white leading-relaxed mb-6">
                    {activeActivity?.question || 'Answer choice correctly to earn streak multi:'}
                  </h3>

                  {activeActivity?.options && (
                    <div className="flex flex-col gap-4 mb-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeActivity.options.map((option, index) => {
                          const optionLetter = ['A', 'B', 'C', 'D'][index] || '';
                          const isSelected = selectedAnswer === optionLetter;

                          return (
                            <motion.button
                              key={index}
                              whileHover={{ y: -2, scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => setSelectedAnswer(optionLetter)}
                              className={`p-4 rounded-2xl border-2 text-left flex flex-col gap-2 transition-all duration-300 relative overflow-hidden ${
                                isSelected
                                  ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.15)] text-white'
                                  : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                  isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  Choice {optionLetter}
                                </span>
                              </div>
                              <span className="font-sans text-sm font-semibold mt-1 leading-normal">
                                {option}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <motion.button
                    whileHover={!selectedAnswer ? {} : { y: -2 }}
                    whileTap={!selectedAnswer ? {} : { scale: 0.98 }}
                    disabled={!selectedAnswer || isSubmitting}
                    onClick={() => handleSubmitAnswer(selectedAnswer)}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800/50 disabled:to-slate-800/50 disabled:text-slate-500 text-sm font-bold text-white shadow-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isSubmitting ? 'Registering Lock...' : 'Lock Final Answer'}
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="locked-success-panel"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="glass-card rounded-3xl p-6 sm:p-8"
                >
                  {(state === 'revealed' || syncState?.activityStatus === 'revealed') ? (
                    <div className="flex flex-col items-center text-center">
                      {studentSubmission ? (
                        <>
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${
                            studentSubmission.isCorrect 
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                              : 'bg-red-500/10 border border-red-500/30 text-red-400'
                          }`}>
                            {studentSubmission.isCorrect ? (
                              <CheckCircle className="w-8 h-8" />
                            ) : (
                              <span className="text-xl font-bold font-mono">X</span>
                            )}
                          </div>

                          <h3 className="font-display text-2xl font-bold text-white mb-2">
                            {studentSubmission.isCorrect ? 'Correct Answer! 🎉' : 'Incorrect Check'}
                          </h3>

                          <p className="text-sm text-slate-400 font-sans max-w-md mx-auto mb-6">
                            {studentSubmission.isCorrect 
                              ? `Superb! You answered correctly and earned +15 points. Streak incremented!` 
                              : `Ah, incorrect. The correct answer was: "${activeActivity?.correctAnswer}". Don't lose focus, try the next one!`}
                          </p>

                          <div className="grid grid-cols-2 gap-3 w-full max-w-sm p-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl text-left mb-2">
                            <div>
                              <span className="block text-[9px] font-mono font-medium text-slate-500 uppercase tracking-widest">
                                Points Earned
                              </span>
                              <span className={`text-lg font-bold font-mono ${studentSubmission.isCorrect ? 'text-emerald-400' : 'text-slate-400'}`}>
                                +{studentSubmission.isCorrect ? '15' : '0'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-mono font-medium text-slate-500 uppercase tracking-widest">
                                Your Selection
                              </span>
                              <span className="text-sm font-sans font-semibold text-indigo-400 truncate block">
                                {(() => {
                                  const optIdx = ['A', 'B', 'C', 'D'].indexOf(studentSubmission.answer.toUpperCase());
                                  const answerText = optIdx >= 0 && activeActivity?.options ? activeActivity.options[optIdx] : studentSubmission.answer;
                                  return `Choice ${studentSubmission.answer.toUpperCase()}: ${answerText}`;
                                })()}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400 mb-5">
                            <Clock className="w-8 h-8" />
                          </div>

                          <h3 className="font-display text-2xl font-bold text-white mb-2">
                            Time's Up! ⏱️
                          </h3>

                          <p className="text-sm text-slate-400 font-sans max-w-md mx-auto leading-relaxed">
                            The activity has ended. You didn't submit an answer in this round.
                            {activeActivity?.correctAnswer && (
                              <span className="block mt-3 text-indigo-400">
                                Correct Answer: <strong className="text-slate-200">"{activeActivity.correctAnswer}"</strong>
                              </span>
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-center">
                      <div className="relative w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 mb-6">
                        <Lock className="w-7 h-7" />
                      </div>

                      <h3 className="font-display text-xl font-bold text-white mb-2">Response Locked ✓</h3>
                      <p className="text-sm text-slate-400 font-sans max-w-[280px] mx-auto mb-4">
                        Waiting for instructor to show final correct responses and standings...
                      </p>

                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-[11px] font-mono text-slate-500 border border-slate-800/60">
                        <span>Total class responses:</span>
                        <span className="text-indigo-400 font-bold">#{syncState.submissionsCount}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* VIEW 4: DYNAMIC LIVE SURVEY POLLS TAB */}
        {isPolls && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-6 border-b border-slate-800/60 pb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white">Live Classroom Poll</h3>
                <p className="text-[10px] text-violet-400 font-mono tracking-widest uppercase">Survey & Sentiment Tracker</p>
              </div>
            </div>

            {syncState.activePoll ? (
              <div>
                <h4 className="font-sans text-base font-semibold text-white leading-relaxed mb-6">
                  Q: {syncState.activePoll.question}
                </h4>

                {/* Check voted status in localStorage */}
                {localStorage.getItem(`voted_poll_${syncState.activePoll.id}`) === 'true' || !syncState.activePoll.isActive ? (
                  // Render visual Poll Results horizontal bar graph
                  <div className="space-y-4">
                    {syncState.activePoll.options.map((option: string, idx: number) => {
                      const votesForOption = Number(syncState.activePoll?.votes[idx]) || 0;
                      const totalVotes = Number(syncState.activePoll?.totalVotes) || 0;
                      const percentage = totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0;
                      
                      return (
                        <div key={idx} className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-300 font-sans">{option}</span>
                            <span className="text-violet-400 font-mono">{percentage}% ({votesForOption} votes)</span>
                          </div>
                          <div className="w-full h-3 bg-slate-950/60 rounded-full border border-slate-800/40 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[10px] font-mono text-slate-500 text-center mt-6">
                      Total Survey Responses recorded: {syncState.activePoll.totalVotes}
                    </p>
                  </div>
                ) : (
                  // Vote choices
                  <div className="flex flex-col gap-3">
                    {syncState.activePoll.options.map((option: string, idx: number) => (
                      <motion.button
                        key={idx}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        disabled={isVoting}
                        onClick={() => handleVoteInPoll(idx)}
                        className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-violet-500/40 hover:bg-slate-900 text-left text-sm font-sans font-semibold text-slate-200 transition-all flex justify-between items-center cursor-pointer"
                      >
                        <span>{option}</span>
                        <ChevronRight className="w-4 h-4 text-violet-500" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center border border-dashed border-slate-800/60 rounded-2xl">
                <p className="text-xs text-slate-500 font-sans">No live poll is currently broadcasted by the instructor.</p>
              </div>
            )}
          </motion.div>
        )}

        {/* VIEW 5: SPEEDTYPER ACTIVE ARENA */}
        {isSpeedtyper && (() => {
          const targetText = activeActivity?.question || "Asynchronous programming prevents main thread blocking and enhances classroom performance.";
          
          // Calculate stats
          const currentWpm = elapsedSecs > 0 ? Math.round((typedText.trim().split(/\s+/).filter(Boolean).length / elapsedSecs) * 60) : 0;
          const currentAccuracy = (() => {
            if (!typedText) return 100;
            let correct = 0;
            const checkLen = Math.min(typedText.length, targetText.length);
            for (let i = 0; i < checkLen; i++) {
              if (typedText[i] === targetText[i]) correct++;
            }
            return Math.round((correct / typedText.length) * 100);
          })();

          const handleSpeedtyperChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = e.target.value;
            if (isSpeedtyperSubmitted || speedtyperSubmitting) return;

            if (!speedtyperStartTime) {
              setSpeedtyperStartTime(Date.now());
            }

            setTypedText(val);

            // Once it matches the passage exactly, stop clock and record to Supabase
            if (val === targetText) {
              const endTime = Date.now();
              setSpeedtyperEndTime(endTime);
              const totalTimeSecs = Math.max(0.1, (endTime - (speedtyperStartTime || Date.now())) / 1000);
              const finalAccuracy = 100;
              const finalWpm = Math.round((targetText.trim().split(/\s+/).length / totalTimeSecs) * 60);

              setSpeedtyperResult({
                wpm: finalWpm,
                accuracy: finalAccuracy,
                time: parseFloat(totalTimeSecs.toFixed(1))
              });

              setIsSpeedtyperSubmitted(true);
              setSpeedtyperSubmitting(true);

              const res = await submitSpeedtyperRecordSupabase(
                joinedCode,
                student?.id || savedStudentId || '',
                student?.name || studentName || 'Student',
                finalWpm,
                finalAccuracy,
                totalTimeSecs,
                targetText
              );

              setSpeedtyperSubmitting(false);
              if (res.success) {
                console.log("Speedtyper score submitted!");
              } else {
                console.warn("Error submitting speedtyper record:", res.error);
              }
            }
          };

          return (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden"
            >
              {/* Animated glowing neon overlay */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800/60 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Mic className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">Speed Typer Arena</h3>
                    <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Classroom Keyboard Race</p>
                  </div>
                </div>

                {/* Optional Speaker promotion notification */}
                {syncState.activityStatus && syncState.activityStatus.startsWith('speaker:') && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-semibold text-cyan-400 font-sans">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span>Presenter Promoted: {syncState.activityStatus.split(':')[1]}</span>
                  </div>
                )}
              </div>

              {!isSpeedtyperSubmitted ? (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">
                      Target Passage to Type:
                    </span>
                    <div className="font-mono text-sm sm:text-base leading-relaxed tracking-wide text-left p-4 rounded-2xl bg-slate-950/80 border border-slate-800/50 max-h-40 overflow-y-auto select-none">
                      {targetText.split('').map((char, idx) => {
                        let colorClass = "text-slate-500";
                        if (idx < typedText.length) {
                          colorClass = typedText[idx] === char ? "text-cyan-400 font-semibold" : "text-red-500 font-bold bg-red-500/10 rounded px-0.5";
                        } else if (idx === typedText.length) {
                          colorClass = "text-indigo-400 font-bold border-b-2 border-indigo-500 animate-pulse";
                        }
                        return (
                          <span key={idx} className={colorClass}>
                            {char}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">
                      Type Here:
                    </span>
                    <textarea
                      rows={3}
                      value={typedText}
                      onChange={handleSpeedtyperChange}
                      placeholder="The race starts as soon as you type the first letter..."
                      className="w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-cyan-500/60 rounded-2xl p-4 font-mono text-sm text-white placeholder-slate-600 focus:outline-none transition-colors resize-none"
                    />
                  </div>

                  {/* Live Stats Board */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-3 text-center">
                      <span className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Speed</span>
                      <span className="text-lg font-mono font-bold text-cyan-400">{currentWpm} <span className="text-[10px] text-slate-500 uppercase">WPM</span></span>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-3 text-center">
                      <span className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Accuracy</span>
                      <span className="text-lg font-mono font-bold text-indigo-400">{currentAccuracy}%</span>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-3 text-center flex flex-col justify-center">
                      <span className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">Time</span>
                      <span className="text-lg font-mono font-bold text-emerald-400">{elapsedSecs.toFixed(1)}s</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-6">
                  <div className="relative inline-flex items-center justify-center">
                    <div className="absolute w-20 h-20 bg-emerald-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                    <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400">
                      <span className="text-2xl">🏁</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-display text-xl font-bold text-white">Race Completed!</h4>
                    <p className="text-xs text-slate-400 font-sans mt-1.5 max-w-sm mx-auto">
                      Great job! Your performance details have been securely synchronized with the teacher's classroom leaderboard.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
                    <div>
                      <span className="block text-[9px] font-mono font-bold text-slate-500 uppercase">Speed</span>
                      <span className="text-base font-mono font-bold text-cyan-400">{speedtyperResult?.wpm} WPM</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-mono font-bold text-slate-500 uppercase">Accuracy</span>
                      <span className="text-base font-mono font-bold text-indigo-400">{speedtyperResult?.accuracy}%</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-mono font-bold text-slate-500 uppercase">Total Time</span>
                      <span className="text-base font-mono font-bold text-emerald-400">{speedtyperResult?.time}s</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider animate-pulse">
                    Waiting for professor to change modules...
                  </p>
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* VIEW 6: MOUNTED FLASHCARDS REVIEW */}
        {isFlashcards && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-6 border-b border-slate-800/60 pb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white">Active Flashcards</h3>
                <p className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase">Dynamic Concept Review</p>
              </div>
            </div>

            {/* Flip container */}
            <div className="perspective-1000 w-full max-w-sm mx-auto">
              <motion.div 
                onClick={() => setIsCardFlipped(!isCardFlipped)}
                animate={{ rotateY: isCardFlipped ? 180 : 0 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
                className="w-full h-64 bg-slate-900 border border-slate-800 rounded-3xl cursor-pointer relative shadow-2xl overflow-hidden"
              >
                {/* FRONT (Term / Concept) */}
                <div 
                  style={{ backfaceVisibility: 'hidden' }} 
                  className="absolute inset-0 flex flex-col justify-between p-6 text-center select-none"
                >
                  <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 uppercase tracking-widest mx-auto">
                    Concept Term
                  </span>
                  <p className="text-xl font-bold text-white leading-relaxed font-sans px-3">
                    {activeActivity?.question || "Asynchronous Concurrency"}
                  </p>
                  <span className="text-[9px] text-slate-500 font-mono tracking-wider uppercase">
                    Tap anywhere to reveal explanation ➔
                  </span>
                </div>

                {/* BACK (Explanation) */}
                <div 
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} 
                  className="absolute inset-0 flex flex-col justify-between p-6 text-center select-none bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950"
                >
                  <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest mx-auto">
                    Description & Explanation
                  </span>
                  <p className="text-sm text-slate-200 leading-relaxed font-sans px-3">
                    {activeActivity?.correctAnswer || "A computer programming design paradigm that manages parallel streams of processing natively without blocking thread counts."}
                  </p>
                  <span className="text-[9px] text-slate-500 font-mono tracking-wider uppercase">
                    Tap to flip card back ➔
                  </span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* VIEW 7: COLLABORATIVE Q&A DEDICATED CENTER TAB */}
        {isQaTab && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <StudentQnaPanel
              roomCode={joinedCode}
              studentName={student?.name || studentName || 'Classmate'}
              socket={socket}
              syncQuestions={syncState.questions}
            />
          </motion.div>
        )}

        {/* VIEW 8: RANKING STANDINGS TAB */}
        {isLeaderboard && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="w-14 h-14 mx-auto bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 mb-5">
              <Award className="w-7 h-7 animate-pulse" />
            </div>

            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20 mb-3 inline-block">
              Leaderboard Standings
            </span>

            <h3 className="font-display text-xl font-bold text-white mb-2">Classroom Rankings</h3>
            <p className="text-sm text-slate-400 font-sans max-w-md mx-auto mb-6">
              See how you score compared to the rest of the classroom. Keep participating to increase your streak!
            </p>

            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-left mb-6 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Your Handle</span>
                <span className="text-lg font-sans font-bold text-white mt-1 block">{student?.name}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Class Rank</span>
                <span className="text-3xl font-mono font-extrabold text-emerald-400 mt-1 block">
                  #{syncState.leaderboard.find(s => s.id === student?.id)?.rank || '--'}
                </span>
              </div>
            </div>

            <div className="text-left flex flex-col gap-3">
              <LeaderboardView students={syncState.leaderboard} currentStudentId={student?.id} limit={15} />
            </div>
          </motion.div>
        )}

        {/* EMBEDDED PERSISTENT Q&A BOARD: Displayed below active panels in all states EXCEPT the Q&A-only tab itself */}
        {!isQaTab && (
          <StudentQnaPanel
            roomCode={joinedCode}
            studentName={student?.name || studentName || 'Classmate'}
            socket={socket}
            syncQuestions={syncState.questions}
          />
        )}

        {/* Locked feedback toast popup */}
        <AnimatePresence>
          {showLockedToast && (
            <motion.div
              variants={toastVariants}
              initial="initial"
              animate={["animate", "vibrate"]}
              exit="exit"
              onClick={() => setShowLockedToast(false)}
              className="fixed bottom-6 right-6 z-50 bg-[#0c1225]/95 border border-emerald-500/40 hover:border-emerald-500/60 shadow-[0_12px_45px_rgba(16,185,129,0.25)] px-4 py-3 rounded-2xl flex items-center gap-3.5 backdrop-blur-xl cursor-pointer select-none max-w-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h4 className="font-display text-xs font-bold text-white tracking-wide">Answer Locked</h4>
                <p className="text-[9px] font-mono text-emerald-400/80 uppercase tracking-widest font-semibold">Response Synchronized</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    );
  }

  // Render Section 5: SESSION COMPLETE (Award Certificate)
  if (state === 'ended') {
    const studentRank = syncState.leaderboard.find(s => s.id === student?.id);
    const isTop3 = studentRank && studentRank.rank <= 3;

    return (
      <div className="w-full max-w-xl mx-auto p-4 flex flex-col justify-center min-h-[85vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden border border-slate-700/50 shadow-[0_0_50px_rgba(59,130,246,0.1)] text-center flex flex-col items-center"
        >
          <div className="absolute -top-24 w-80 h-80 bg-gradient-to-br from-indigo-500/20 via-blue-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="text-amber-400 mb-4 animate-bounce relative">
            <Award className="w-16 h-16" />
            <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-indigo-400 animate-pulse" />
          </div>

          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20 mb-3">
            Lecture Completed
          </span>

          <h2 className="font-display text-2xl font-bold text-white mb-1">Session Summary</h2>
          <p className="text-xs text-slate-400 font-sans uppercase tracking-wider mb-6">
            {subject} • {teacherName}
          </p>

          {/* Certificate */}
          <div className="w-full p-5 rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800/80 text-center relative overflow-hidden mb-6 shadow-2xl">
            <div className="absolute inset-2 border border-dashed border-slate-800/40 rounded-xl pointer-events-none" />

            <span className="text-[8px] font-mono tracking-widest text-slate-500 uppercase block mb-3">
              Certificate of Lecture Participation
            </span>

            <h3 className="font-display text-lg font-bold text-slate-200 mb-1">{student?.name}</h3>
            <p className="text-xs text-slate-500 mb-6">Successfully participated in live lecture interactive checks.</p>

            <div className="grid grid-cols-3 gap-2 relative z-10">
              <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <span className="block text-[8px] font-mono font-medium text-slate-500 uppercase tracking-wider mb-1">
                  Final Rank
                </span>
                <span className={`text-base font-extrabold font-mono ${
                  isTop3 ? 'text-amber-400' : 'text-blue-400'
                }`}>
                  #{studentRank?.rank || '--'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <span className="block text-[8px] font-mono font-medium text-slate-500 uppercase tracking-wider mb-1">
                  Correct Answer
                </span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {student?.correctCount || 0}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <span className="block text-[8px] font-mono font-medium text-slate-500 uppercase tracking-wider mb-1">
                  Total Points
                </span>
                <span className="text-base font-bold font-mono text-slate-100">
                  {student?.score || '0.00'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 font-sans max-w-sm mb-6 leading-relaxed">
            Congratulations on keeping engaged throughout the lecture! Active engagement significantly boosts academic retention and performance.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="px-5 h-11 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Join another lecture</span>
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}

interface StudentQnaPanelProps {
  roomCode: string;
  studentName: string;
  socket: any;
  syncQuestions?: Array<{
    id: string;
    studentName: string;
    questionText: string;
    text?: string;
    timestamp: number;
    votes: number;
    isAnswered: boolean;
    answerText?: string;
  }>;
}

function StudentQnaPanel({ roomCode, studentName, socket, syncQuestions = [] }: StudentQnaPanelProps) {
  const [questionText, setQuestionText] = useState('');
  const [localQuestions, setLocalQuestions] = useState<Array<any>>([]);

  // Combine local offline and server-sync questions
  useEffect(() => {
    if (isSupabaseConfigured()) {
      const stored = localStorage.getItem(`engage_questions_${roomCode}`);
      if (stored) {
        try {
          setLocalQuestions(JSON.parse(stored));
        } catch (e) {
          setLocalQuestions([]);
        }
      }
    }
  }, [roomCode, syncQuestions]);

  const questionsList = isSupabaseConfigured() ? syncQuestions : localQuestions;
  const sortedQuestions = [...questionsList].sort((a, b) => b.votes - a.votes || b.timestamp - a.timestamp);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    if (isSupabaseConfigured()) {
      const res = await submitQaQuestionSupabase(roomCode, studentName, questionText.trim());
      if (res.success) {
        setQuestionText('');
      } else {
        console.error('Q&A submit failed:', res.error);
      }
    } else {
      socket.emit('student:ask_question', { roomCode, studentName, text: questionText.trim() });
      setQuestionText('');
    }
  };

  const handleUpvote = async (id: string, currentVotes: number) => {
    if (isSupabaseConfigured()) {
      await upvoteQaQuestionSupabase(id, currentVotes);
    } else {
      socket.emit('student:upvote_question', { roomCode, questionId: id });
    }
  };

  return (
    <div className="glass-card rounded-3xl p-6 border border-slate-800/80 mt-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-600/5 to-transparent rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex items-center gap-2.5 mb-5 border-b border-slate-800/60 pb-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <MessageCircle className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-display text-sm font-bold text-white">Lecture Q&A Board</h4>
          <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Real-Time Interaction</p>
        </div>
      </div>

      <form onSubmit={handlePost} className="flex gap-2 mb-5">
        <input
          type="text"
          maxLength={120}
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="Ask a question about the lecture material..."
          className="flex-1 h-10 bg-slate-950/40 border border-slate-800 rounded-xl px-3.5 font-sans text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={!questionText.trim()}
          className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-xs font-bold text-white transition-colors cursor-pointer"
        >
          Post
        </motion.button>
      </form>

      {sortedQuestions.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-slate-800/60 rounded-2xl bg-slate-950/20">
          <p className="text-xs text-slate-500 font-sans">No questions posted yet. Be the first to ask!</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          {sortedQuestions.map((q) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-xl border border-slate-800 bg-slate-950/30 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-3 w-full">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 leading-relaxed font-sans font-medium break-words">
                    {q.questionText || q.text}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[9px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase">
                      {q.studentName}
                    </span>
                    <span className="text-[9px] text-slate-600 font-mono">
                      {new Date(q.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleUpvote(q.id, q.votes)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-800 hover:border-indigo-500/20 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-400 transition-all cursor-pointer min-w-10 h-10 gap-0.5"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono font-extrabold text-slate-300">
                    {q.votes || 0}
                  </span>
                </motion.button>
              </div>

              {/* Show answered text if present */}
              {q.isAnswered && q.answerText && (
                <div className="mt-1 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs">
                  <div className="flex items-center gap-1 mb-1 text-emerald-400 font-semibold font-mono text-[9px] uppercase tracking-wider">
                    <CheckCircle className="w-3 h-3" />
                    <span>Answered by Instructor:</span>
                  </div>
                  <p className="text-slate-300 font-sans leading-relaxed break-words">{q.answerText}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
