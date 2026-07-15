/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_ACTIVITIES } from './src/defaultActivities.js';
import { Room, Student, Activity, Submission, RoomState, SyncStatePayload } from './src/types.js';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Enable CORS for development
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 10000,
  pingInterval: 5000,
});

// In-memory state storage
const rooms = new Map<string, Room>();
const timers = new Map<string, NodeJS.Timeout>();

// Helper to generate a unique room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper to build a sync state payload for a specific student (or host if studentId is null)
function getSyncState(roomCode: string, studentId: string | null): SyncStatePayload | null {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const studentsList = Object.values(room.students);
  const studentsCount = studentsList.length;

  const activeActivity = room.currentActivityIndex >= 0 && room.currentActivityIndex < room.activities.length
    ? room.activities[room.currentActivityIndex]
    : null;

  const student = studentId ? (room.students[studentId] || null) : null;
  const submissionsList = Object.values(room.submissions);
  const studentSubmission = studentId ? (room.submissions[studentId] || null) : null;
  const studentConfusionVote = studentId ? (room.confusionVotes[studentId] || null) : null;

  // Build sorted leaderboard
  const leaderboard = studentsList
    .map((s, idx) => ({
      ...s,
      rank: 1, // Will calculate below
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.joinedAt - b.joinedAt; // tie-breaker
    });

  // Assign ranks
  let currentRank = 1;
  for (let i = 0; i < leaderboard.length; i++) {
    if (i > 0 && leaderboard[i].score < leaderboard[i - 1].score) {
      currentRank = i + 1;
    }
    leaderboard[i].rank = currentRank;
  }

  return {
    roomCode: room.code,
    teacherName: room.teacherName,
    subject: room.subject,
    state: room.state,
    studentsCount,
    currentActivityIndex: room.currentActivityIndex,
    activitiesCount: room.activities.length,
    timeRemaining: room.timeRemaining,
    activeActivity,
    student,
    submissionsCount: submissionsList.length,
    studentSubmission,
    studentConfusionVote,
    leaderboard,
    questions: (room as any).questions || [],
  };
}

// Emit state syncs to everyone in a room
function broadcastRoomUpdate(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Broadcast full update to the room host channel
  io.to(`${roomCode}:host`).emit('room:host_sync', {
    code: room.code,
    teacherName: room.teacherName,
    subject: room.subject,
    state: room.state,
    currentActivityIndex: room.currentActivityIndex,
    timeRemaining: room.timeRemaining,
    students: Object.values(room.students),
    submissions: Object.values(room.submissions),
    confusionVotes: room.confusionVotes,
    activities: room.activities,
    questions: (room as any).questions || [],
  });

  // For individual students, we broadcast general details or we can iterate and sync
  const studentsList = Object.values(room.students);
  studentsList.forEach((std) => {
    const payload = getSyncState(roomCode, std.id);
    if (payload) {
      io.to(std.socketId).emit('room:sync', payload);
    }
  });

  // Also broadcast to the general room socket group (for generic displays or non-student observers)
  const genericPayload = getSyncState(roomCode, null);
  if (genericPayload) {
    io.to(roomCode).emit('room:generic_sync', genericPayload);
  }
}

// Live confusion stats compiler
function getConfusionStats(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return { understood: 0, partial: 0, confused: 0, total: 0 };

  const stats = { understood: 0, partial: 0, confused: 0, total: 0 };
  Object.values(room.confusionVotes).forEach((vote) => {
    if (vote === 'understood') stats.understood++;
    else if (vote === 'partial') stats.partial++;
    else if (vote === 'confused') stats.confused++;
    stats.total++;
  });
  return stats;
}

// Server scoring helper
function calculatePoints(rankIndex: number, totalActiveStudents: number): number {
  const basePoints = 9.99;
  const standardDecrement = 0.04;
  const maxPossibleStudents = Math.max(10, totalActiveStudents);
  const dynamicDecrement = Math.min(standardDecrement, 8.0 / maxPossibleStudents);
  
  const score = basePoints - (rankIndex * dynamicDecrement);
  return parseFloat(Math.max(1.0, score).toFixed(2));
}

// Socket communication protocol
io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Host creates a classroom
  socket.on('host:create_room', ({ subject, teacherName, customActivities }, callback) => {
    try {
      const code = generateRoomCode();
      const activities = customActivities && customActivities.length > 0
        ? customActivities
        : (DEFAULT_ACTIVITIES[subject] || DEFAULT_ACTIVITIES['Web Engineering (CS302)']);

      const newRoom: Room = {
        code,
        teacherName,
        subject,
        students: {},
        activities,
        currentActivityIndex: -1,
        state: 'waiting',
        timeRemaining: 0,
        submissions: {},
        confusionVotes: {},
      };

      rooms.set(code, newRoom);
      socket.join(`${code}:host`);
      socket.join(code);

      console.log(`Classroom ${code} created for ${teacherName} (${subject})`);
      callback({ success: true, roomCode: code });
      broadcastRoomUpdate(code);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // 2. Client reconnect/sync check
  socket.on('sync:request', ({ roomCode, studentId, role }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('sync:failed', { error: 'Room session not found' });
      return;
    }

    if (role === 'host') {
      socket.join(`${roomCode}:host`);
      socket.join(roomCode);
      broadcastRoomUpdate(roomCode);
    } else if (studentId) {
      const student = room.students[studentId];
      if (student) {
        student.socketId = socket.id;
        student.lastActive = Date.now();
        socket.join(roomCode);
        const payload = getSyncState(roomCode, studentId);
        if (payload) {
          socket.emit('room:sync', payload);
        }
        // Notify host of reconnection
        io.to(`${roomCode}:host`).emit('student:reconnected', student);
        broadcastRoomUpdate(roomCode);
      } else {
        socket.emit('sync:failed', { error: 'Student session expired or invalid.' });
      }
    }
  });

  // 3. Student joins a classroom
  socket.on('student:join_room', ({ roomCode, name, studentId: existingId }, callback) => {
    const code = roomCode?.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      callback({ success: false, error: 'Room Code not found. Please try again.' });
      return;
    }

    if (room.state === 'ended') {
      callback({ success: false, error: 'This session has already ended.' });
      return;
    }

    // Check if re-joining with existing studentId
    if (existingId && room.students[existingId]) {
      const std = room.students[existingId];
      std.socketId = socket.id;
      std.lastActive = Date.now();
      socket.join(code);
      callback({ success: true, studentId: existingId, name: std.name, roomCode: code });
      broadcastRoomUpdate(code);
      return;
    }

    // Prevent name duplicates in active participants
    const nameLower = name.trim().toLowerCase();
    const isDuplicate = Object.values(room.students).some(
      (s) => s.name.trim().toLowerCase() === nameLower
    );

    let finalName = name.trim();
    if (isDuplicate) {
      // Append random number to avoid name clashing
      finalName = `${finalName} #${Math.floor(100 + Math.random() * 900)}`;
    }

    const studentId = 'std-' + Math.random().toString(36).substring(2, 9);
    const newStudent: Student = {
      id: studentId,
      name: finalName,
      socketId: socket.id,
      score: 0,
      streak: 0,
      correctCount: 0,
      joinedAt: Date.now(),
      lastActive: Date.now(),
    };

    room.students[studentId] = newStudent;
    socket.join(code);

    console.log(`Student ${finalName} (${studentId}) joined room ${code}`);
    callback({ success: true, studentId, name: finalName, roomCode: code });
    broadcastRoomUpdate(code);
  });

  // 4. Host starts the active lecture session
  socket.on('host:start_session', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.state = 'idle';
    room.currentActivityIndex = -1;
    broadcastRoomUpdate(roomCode);
  });

  // 5. Host launches an activity
  socket.on('host:launch_activity', ({ roomCode, activityIndex }) => {
    const room = rooms.get(roomCode);
    if (!room || activityIndex < 0 || activityIndex >= room.activities.length) return;

    // Reset submissions and confusion votes
    room.state = 'active';
    room.currentActivityIndex = activityIndex;
    room.submissions = {};
    room.confusionVotes = {};
    
    const activity = room.activities[activityIndex];
    room.timeRemaining = activity.timeLimit;

    // Clear previous timer if any
    const existingTimer = timers.get(roomCode);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Broadcast immediate activity start
    broadcastRoomUpdate(roomCode);

    // Create server-authoritative countdown ticker
    const interval = setInterval(() => {
      const activeRoom = rooms.get(roomCode);
      if (!activeRoom || activeRoom.state !== 'active') {
        clearInterval(interval);
        timers.delete(roomCode);
        return;
      }

      activeRoom.timeRemaining -= 1;

      if (activeRoom.timeRemaining <= 0) {
        clearInterval(interval);
        timers.delete(roomCode);
        activeRoom.timeRemaining = 0;
        
        // Auto end activity
        endActivityState(roomCode);
      } else {
        // Broadcast the updated remaining time
        io.to(roomCode).emit('activity:tick', { timeRemaining: activeRoom.timeRemaining });
      }
    }, 1000);

    timers.set(roomCode, interval);
  });

  // Internal helper to close/reveal an activity and tally gamified scores
  function endActivityState(roomCode: string) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const activity = room.activities[room.currentActivityIndex];
    if (!activity) return;

    // Transition state
    room.state = 'revealed';

    const submissionsList = Object.values(room.submissions);
    // Sort submissions chronologically by arrival on server
    submissionsList.sort((a, b) => a.timestamp - b.timestamp);

    // Filter correct submissions to award points
    let correctRankIndex = 0;
    const totalStudents = Object.keys(room.students).length;

    // We also want to record who attempted and who was wrong to update streaks
    const attemptedStudentIds = new Set(submissionsList.map(s => s.studentId));

    submissionsList.forEach((sub) => {
      if (sub.isCorrect) {
        const points = calculatePoints(correctRankIndex, totalStudents);
        sub.points = points;
        sub.rank = correctRankIndex + 1;

        // Apply to student persistent stats
        const student = room.students[sub.studentId];
        if (student) {
          student.score = parseFloat((student.score + points).toFixed(2));
          student.correctCount += 1;
          student.streak += 1;
        }
        correctRankIndex++;
      } else {
        // Incorrect submission resets streak
        const student = room.students[sub.studentId];
        if (student) {
          student.streak = 0;
        }
      }
    });

    // Reset streaks for students who did not attempt at all (unattempted)
    Object.values(room.students).forEach((student) => {
      if (!attemptedStudentIds.has(student.id)) {
        student.streak = 0;
      }
    });

    // Save timer removal
    const timer = timers.get(roomCode);
    if (timer) {
      clearInterval(timer);
      timers.delete(roomCode);
    }

    broadcastRoomUpdate(roomCode);
  }

  // 6. Host closes/reveals activity manually early
  socket.on('host:reveal_answer', ({ roomCode }) => {
    endActivityState(roomCode);
  });

  // 7. Student submits an answer for MCQ / Fastest Finger
  socket.on('student:submit_answer', ({ roomCode, studentId, answer }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) {
      callback({ success: false, error: 'Room session not found.' });
      return;
    }

    if (room.state !== 'active') {
      callback({ success: false, error: 'Submissions are closed for this activity.' });
      return;
    }

    // Check if already submitted
    if (room.submissions[studentId]) {
      callback({ success: false, error: 'You have already submitted an answer.' });
      return;
    }

    const activity = room.activities[room.currentActivityIndex];
    if (!activity) {
      callback({ success: false, error: 'No active activity.' });
      return;
    }

    const student = room.students[studentId];
    if (!student) {
      callback({ success: false, error: 'Student session not registered in this room.' });
      return;
    }

    // Capture server-authoritative submission arrival delay (in ms) from activity launch
    const durationLimit = activity.timeLimit * 1000;
    const timeRemainingMs = room.timeRemaining * 1000;
    const elapsedMs = Math.max(1, durationLimit - timeRemainingMs);

    // Validate correctness
    let isCorrect = false;
    if (activity.correctAnswer) {
      const normalizedAnswer = answer.toString().trim().toLowerCase();
      const normalizedCorrect = activity.correctAnswer.toString().trim().toLowerCase();
      isCorrect = normalizedAnswer === normalizedCorrect;
    }

    const newSubmission: Submission = {
      studentId,
      studentName: student.name,
      answer: answer.toString(),
      isCorrect,
      timestamp: elapsedMs,
      points: 0, // Calculated dynamically when activity closes
      rank: 0,
    };

    room.submissions[studentId] = newSubmission;

    console.log(`Submission received: ${student.name} - Answer: "${answer}" - Correct: ${isCorrect}`);
    callback({ success: true });

    // Check if ALL registered active students have submitted to automatically reveal early
    const totalStudents = Object.keys(room.students).length;
    const totalSubmissions = Object.keys(room.submissions).length;
    
    if (totalStudents > 0 && totalSubmissions >= totalStudents) {
      endActivityState(roomCode);
    } else {
      broadcastRoomUpdate(roomCode);
    }
  });

  // 8. Student submits confusion vote
  socket.on('student:submit_confusion', ({ roomCode, studentId, level }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.confusionVotes[studentId] = level;

    // Immediately push live compiled confusion updates to host only for lowest latency
    const stats = getConfusionStats(roomCode);
    io.to(`${roomCode}:host`).emit('confusion:update', stats);
    broadcastRoomUpdate(roomCode);
  });

  // 9. Host goes to the next activity
  socket.on('host:next_activity', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.currentActivityIndex < room.activities.length - 1) {
      room.currentActivityIndex += 1;
      room.state = 'idle';
      room.submissions = {};
      room.confusionVotes = {};
      room.timeRemaining = 0;
      broadcastRoomUpdate(roomCode);
    } else {
      // Completed all activities
      room.state = 'ended';
      broadcastRoomUpdate(roomCode);
    }
  });

  // 10. Host ends the entire classroom session
  socket.on('host:end_session', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.state = 'ended';
    broadcastRoomUpdate(roomCode);
    io.to(roomCode).emit('session:ended');
  });

  // Host updates specific state value
  socket.on('host:set_state', ({ roomCode, state }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.state = state;
    broadcastRoomUpdate(roomCode);
  });

  // Host adds a dynamic activity on the fly
  socket.on('host:add_activity', ({ roomCode, activity }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) {
      if (callback) callback({ success: false });
      return;
    }
    room.activities.push(activity);
    broadcastRoomUpdate(roomCode);
    if (callback) callback({ success: true, index: room.activities.length - 1 });
  });

  // 10.5 Student posts/upvotes Q&A Questions
  socket.on('student:ask_question', ({ roomCode, studentName, text }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    (room as any).questions = (room as any).questions || [];
    (room as any).questions.push({
      id: 'q-' + Math.random().toString(36).substring(2, 9),
      studentName,
      text: text?.trim(),
      timestamp: Date.now(),
      upvotes: 0
    });
    broadcastRoomUpdate(roomCode);
  });

  socket.on('student:upvote_question', ({ roomCode, questionId }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    (room as any).questions = (room as any).questions || [];
    const q = (room as any).questions.find((x: any) => x.id === questionId);
    if (q) {
      q.upvotes = (q.upvotes || 0) + 1;
    }
    broadcastRoomUpdate(roomCode);
  });

  // 11. Disconnect cleanup (graceful)
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    // We do not immediately purge students so they don't lose points on page refreshes
    // They can simply reconnect using their stored studentId
  });
});

// REST API endpoint for health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size });
});

// REST API to export results
app.get('/api/export/:roomCode', (req, res) => {
  const code = req.params.roomCode?.toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  // Compile final results
  const studentsList = Object.values(room.students).sort((a, b) => b.score - a.score);
  res.json({
    roomCode: room.code,
    subject: room.subject,
    teacherName: room.teacherName,
    activeStudentsCount: studentsList.length,
    students: studentsList.map((s, idx) => ({
      rank: idx + 1,
      name: s.name,
      score: s.score,
      correctCount: s.correctCount,
      streak: s.streak,
    })),
  });
});

// Setup Vite development server or production assets
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Vite Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
