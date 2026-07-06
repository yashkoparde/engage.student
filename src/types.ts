/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ActivityType = 'mcq' | 'confusion' | 'fastest_finger' | 'resource' | 'poll' | 'flashcard';

export interface Activity {
  id: string;
  type: ActivityType;
  question: string;
  options?: string[]; // Used for MCQ / Fastest Finger MCQ
  correctAnswer?: string; // Used for MCQ / Fastest Finger checking (case-insensitive for text)
  timeLimit: number; // in seconds
  fingerType?: 'mcq' | 'numeric' | 'text'; // Fastest finger input types
}

export interface Student {
  id: string;
  name: string;
  socketId: string;
  score: number;
  streak: number;
  correctCount: number;
  lastActive: number;
  joinedAt: number;
}

export type RoomState = 
  | 'lobby' 
  | 'waiting' 
  | 'overview' 
  | 'launcher' 
  | 'polls' 
  | 'speedtyper' 
  | 'flashcards' 
  | 'qa' 
  | 'leaderboard' 
  | 'ended' 
  | 'idle' 
  | 'active' 
  | 'revealed';

export interface Submission {
  studentId: string;
  studentName: string;
  answer: string;
  isCorrect: boolean;
  timestamp: number; // milliseconds since activity started
  points: number;
  rank: number;
  activityId?: string;
}

export interface ConfusionStats {
  understood: number;
  partial: number;
  confused: number;
  total: number;
}

export interface Room {
  code: string;
  teacherName: string;
  subject: string;
  students: Record<string, Student>;
  activities: Activity[];
  currentActivityIndex: number;
  state: RoomState;
  timeRemaining: number;
  submissions: Record<string, Submission>; // Key: studentId
  confusionVotes: Record<string, 'understood' | 'partial' | 'confused'>; // Key: studentId
}

export interface SyncStatePayload {
  roomCode: string;
  teacherName: string;
  subject: string;
  state: RoomState;
  studentsCount: number;
  currentActivityIndex: number;
  activitiesCount: number;
  timeRemaining: number;
  activeActivity: Activity | null;
  student: Student | null;
  submissionsCount: number;
  studentSubmission: Submission | null;
  studentConfusionVote: 'understood' | 'partial' | 'confused' | null;
  leaderboard: Array<Student & { rank: number }>;
  questions?: Array<{
    id: string;
    studentName: string;
    questionText: string;
    text?: string; // fallback
    timestamp: number;
    votes: number;
    upvotes?: number; // fallback
    isAnswered: boolean;
    answerText?: string;
  }>;
  activityStatus?: string;
  activePoll?: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    votes: Record<string, number>;
    totalVotes: number;
  } | null;
}
