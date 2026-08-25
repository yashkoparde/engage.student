/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { SyncStatePayload, Student, Submission, Activity, RoomState } from '../types.js';
import { DEFAULT_ACTIVITIES } from '../defaultActivities.js';

const supabaseUrl = (((import.meta as any).env?.VITE_SUPABASE_URL) || 'https://eobueywpicipvrzuapdu.supabase.co').trim();
const supabaseAnonKey = (((import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || 'sb_publishable_bnEwwndlllwc8BriKWzl4A_RMeyNATa').trim();

// Initialize client if credentials are provided
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * Helper to fetch a room robustly supporting both code and room_code column structures
 */
export async function fetchRoom(code: string) {
  if (!supabase) return { data: null, error: 'Supabase not initialized' };
  
  const original = code.trim();
  const upper = original.toUpperCase();
  const lower = original.toLowerCase();
  const codesToTry = Array.from(new Set([original, upper, lower]));
  
  // Try room_code first
  const { data: rCode, error: errCode } = await supabase
    .from('rooms')
    .select('*')
    .in('room_code', codesToTry)
    .maybeSingle();

  if (rCode) {
    return { data: rCode, error: null };
  }

  // Fallback to code
  const { data: rLegacy, error: errLegacy } = await supabase
    .from('rooms')
    .select('*')
    .in('code', codesToTry)
    .maybeSingle();

  return { data: rLegacy, error: rLegacy ? null : (errLegacy || errCode) };
}

/**
 * Normalizes DB room row into React Room State
 */
export function normalizeRoom(room: any) {
  if (!room) return null;
  const subjName = room.subject_name || room.subject || 'Web Engineering (CS302)';
  let dbActivities: Activity[] = [];
  try {
    dbActivities = typeof room.activities === 'string' 
      ? JSON.parse(room.activities) 
      : (room.activities || []);
  } catch (e) {
    dbActivities = room.activities || [];
  }
  if (!dbActivities || dbActivities.length === 0) {
    dbActivities = DEFAULT_ACTIVITIES[subjName] || DEFAULT_ACTIVITIES['Web Engineering (CS302)'];
  }

  // Handle direct dynamic questions published directly by external teacher portals on standard columns
  let directQuestion = room.current_question_text || room.question || room.current_question || room.active_question || room.active_activity_question || room.mcq_question || room.question_text || '';
  let directOptions = room.current_options || room.options || room.current_options || room.active_options || room.active_activity_options || room.mcq_options || room.question_options || null;
  let directCorrect = room.correct_answer || room.correct_option || room.correct || room.mcq_correct || room.correct_answer_text || '';

  let directActivity: any = null;
  if (directQuestion) {
    let parsedOptions: string[] = [];
    if (Array.isArray(directOptions)) {
      parsedOptions = directOptions.map(String);
    } else if (typeof directOptions === 'string') {
      try {
        parsedOptions = JSON.parse(directOptions);
      } catch (e) {
        parsedOptions = directOptions.split(',').map((o: string) => o.trim());
      }
    }
    
    // Fallback options if none found
    if (!parsedOptions || parsedOptions.length === 0) {
      parsedOptions = ['A', 'B', 'C', 'D'];
    }

    directActivity = {
      id: room.active_activity_id || room.current_activity_id || 'direct-mcq',
      type: (room.activity_type || room.type || 'mcq') as any,
      question: directQuestion,
      options: parsedOptions,
      correctAnswer: directCorrect,
      timeLimit: Number(room.time_limit || room.duration || 20)
    };
  }

  // Determine the robust normalized room state
  let normState = room.state || 'lobby';
  if (room.state === 'ended' || room.status === 'ended') {
    normState = 'ended';
  } else if (room.state === 'revealed' || room.activity_status === 'revealed' || room.reveal_answers === true || room.show_answers === true) {
    normState = 'revealed';
  } else if (room.state) {
    normState = room.state;
  } else if (directQuestion) {
    normState = 'active';
  }

  return {
    code: room.room_code || room.code,
    teacher_name: room.teacher_name,
    subject: subjName,
    state: normState as RoomState,
    current_activity_index: room.current_activity_index !== undefined ? Number(room.current_activity_index) : (room.current_activity_id ? parseInt(room.current_activity_id) : -1),
    time_remaining: room.time_remaining !== undefined ? Number(room.time_remaining) : (room.timer_remaining !== undefined ? Number(room.timer_remaining) : 0),
    activities: dbActivities,
    activity_status: room.activity_status || 'idle',
    directActivity: directActivity
  };
}

/**
 * Check if Supabase credentials are configured in the environment variables
 */
export function isSupabaseConfigured(): boolean {
  return !!supabase;
}

/**
 * Join classroom using Supabase backend
 */
export async function joinRoomSupabase(
  roomCode: string, 
  name: string, 
  existingStudentId?: string
): Promise<{ success: boolean; studentId?: string; name?: string; roomCode?: string; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured in environment variables.' };
  }

  try {
    // 1. Fetch room
    const { data: room, error: roomError } = await fetchRoom(roomCode);

    if (roomError || !room) {
      return { success: false, error: 'Classroom room code not found.' };
    }

    const dbCode = room.room_code || room.code || roomCode.trim();

    if (room.state === 'ended') {
      return { success: false, error: 'This classroom session has already ended.' };
    }

    // 2. Re-join existing session if matching student ID is provided
    if (existingStudentId) {
      const { data: existingStudent, error: stdError } = await supabase
        .from('students')
        .select('*')
        .eq('id', existingStudentId)
        .eq('room_code', dbCode)
        .single();

      if (!stdError && existingStudent) {
        // Update heartbeat/last active
        await supabase
          .from('students')
          .update({ last_active: new Date().toISOString() })
          .eq('id', existingStudentId);

        return { 
          success: true, 
          studentId: existingStudentId, 
          name: existingStudent.name, 
          roomCode: dbCode 
        };
      }
    }

    // 3. Prevent duplicate name in active students
    const { data: activeStudents } = await supabase
      .from('students')
      .select('name')
      .eq('room_code', dbCode);

    const nameLower = name.trim().toLowerCase();
    const isDuplicate = (activeStudents || []).some(
      (s: any) => s.name.trim().toLowerCase() === nameLower
    );

    let finalName = name.trim();
    if (isDuplicate) {
      finalName = `${finalName} #${Math.floor(100 + Math.random() * 900)}`;
    }

    // 4. Create new student record with a resilient schema resolver
    const studentId = 'std-' + Math.random().toString(36).substring(2, 9);
    let finalStudentRow: any = null;
    let finalErrorMsg = '';

    // Variant 1: Modern rich schema with custom text id, correct count, and custom joined/active timestamps
    try {
      const { data, error } = await supabase
        .from('students')
        .insert([{
          id: studentId,
          room_code: dbCode,
          name: finalName,
          score: 0,
          streak: 0,
          correct_count: 0,
          joined_at: Date.now(),
          last_active: Date.now()
        }])
        .select()
        .maybeSingle();

      if (!error && data) {
        finalStudentRow = data;
      } else if (error) {
        console.warn('Student register Variant 1 failed:', error.message);
        finalErrorMsg = error.message;
      }
    } catch (e: any) {
      console.warn('Student register Variant 1 exception:', e);
      finalErrorMsg = e.message || String(e);
    }

    // Variant 2: Minimalist schema with custom text id (but no extra correct_count or timestamp columns)
    if (!finalStudentRow) {
      try {
        const { data, error } = await supabase
          .from('students')
          .insert([{
            id: studentId,
            room_code: dbCode,
            name: finalName,
            score: 0,
            streak: 0
          }])
          .select()
          .maybeSingle();

        if (!error && data) {
          finalStudentRow = data;
        } else if (error) {
          console.warn('Student register Variant 2 failed:', error.message);
          finalErrorMsg = error.message;
        }
      } catch (e: any) {
        console.warn('Student register Variant 2 exception:', e);
      }
    }

    // Variant 3: Schema where ID is auto-generated (e.g. bigserial or UUID) and standard updated_at exists
    if (!finalStudentRow) {
      try {
        const { data, error } = await supabase
          .from('students')
          .insert([{
            room_code: dbCode,
            name: finalName,
            score: 0,
            streak: 0,
            updated_at: new Date().toISOString()
          }])
          .select()
          .maybeSingle();

        if (!error && data) {
          finalStudentRow = data;
        } else if (error) {
          console.warn('Student register Variant 3 failed:', error.message);
          finalErrorMsg = error.message;
        }
      } catch (e: any) {
        console.warn('Student register Variant 3 exception:', e);
      }
    }

    // Variant 4: Absolutely bare-minimum columns (room_code, name, score, streak) with auto-generated ID
    if (!finalStudentRow) {
      try {
        const { data, error } = await supabase
          .from('students')
          .insert([{
            room_code: dbCode,
            name: finalName,
            score: 0,
            streak: 0
          }])
          .select()
          .maybeSingle();

        if (!error && data) {
          finalStudentRow = data;
        } else if (error) {
          console.warn('Student register Variant 4 failed:', error.message);
          finalErrorMsg = error.message;
        }
      } catch (e: any) {
        console.warn('Student register Variant 4 exception:', e);
      }
    }

    // Variant 5: Legacy/alternative code column instead of room_code
    if (!finalStudentRow) {
      try {
        const { data, error } = await supabase
          .from('students')
          .insert([{
            code: dbCode,
            name: finalName,
            score: 0,
            streak: 0
          }])
          .select()
          .maybeSingle();

        if (!error && data) {
          finalStudentRow = data;
        } else if (error) {
          console.warn('Student register Variant 5 failed:', error.message);
          finalErrorMsg = error.message;
        }
      } catch (e: any) {
        console.warn('Student register Variant 5 exception:', e);
      }
    }

    if (!finalStudentRow) {
      return { success: false, error: 'Could not register student: ' + finalErrorMsg };
    }

    return { 
      success: true, 
      studentId: finalStudentRow.id || studentId, 
      name: finalName, 
      roomCode: dbCode 
    };

  } catch (err: any) {
    return { success: false, error: err.message || 'Error occurred while joining.' };
  }
}

/**
 * Submit student activity answer to Supabase
 */
export async function submitAnswerSupabase(
  roomCode: string,
  studentId: string,
  studentName: string,
  answer: string,
  isCorrect: boolean,
  elapsedMs: number,
  activityId: string = 'current_check'
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  try {
    const code = roomCode.toUpperCase().trim();

    // Check if submission already exists (using room_code, student_id and specific activity_id filter)
    const { data: existing } = await supabase
      .from('submissions')
      .select('id')
      .eq('room_code', code)
      .eq('student_id', studentId)
      .eq('activity_id', activityId)
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'You have already submitted an answer for this activity.' };
    }

    const schemaSubmission = {
      room_code: code,
      student_id: studentId,
      student_name: studentName,
      activity_id: activityId,
      choice: answer.toString(),
      speed_ms: Math.round(elapsedMs),
      submitted_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('submissions')
      .insert([schemaSubmission]);

    if (error) {
      // Retry with full legacy/alternative columns if any column mismatch occurs
      const fullSubmission = {
        room_code: code,
        student_id: studentId,
        student_name: studentName,
        answer: answer.toString(),
        choice: answer.toString(),
        selected_option: answer.toString().substring(0, 5),
        is_correct: isCorrect,
        timestamp: elapsedMs,
        speed_ms: elapsedMs,
        activity_id: activityId,
        points: 0,
        rank: 0
      };

      const { error: secondError } = await supabase
        .from('submissions')
        .insert([fullSubmission]);

      if (secondError) {
        return { success: false, error: 'Failed to insert submission: ' + secondError.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error sending submission.' };
  }
}

/**
 * Submit or update confusion meter vote in Supabase
 */
export async function submitConfusionSupabase(
  roomCode: string,
  studentId: string,
  level: 'understood' | 'partial' | 'confused'
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured.' };
  }

  try {
    const code = roomCode.toUpperCase().trim();

    const coreVote = {
      room_code: code,
      student_id: studentId,
      status: level,
      updated_at: new Date().toISOString()
    };

    // Try upserting schema vote first (onConflict: student_id is the primary key)
    const { error } = await supabase
      .from('confusion_votes')
      .upsert(coreVote, {
        onConflict: 'student_id'
      });

    if (error) {
      const fullVote = {
        room_code: code,
        student_id: studentId,
        level: level,
        status: level,
        updated_at: new Date().toISOString()
      };

      const { error: secondError } = await supabase
        .from('confusion_votes')
        .upsert(fullVote, {
          onConflict: 'room_code,student_id'
        });

      if (secondError) {
        return { success: false, error: 'Failed to log confusion level: ' + secondError.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error occurred.' };
  }
}

/**
 * Subscribe to classroom changes and compile full state payloads
 */
/**
 * Subscribe to classroom changes and compile full state payloads
 */
export function subscribeToRoom(
  roomCode: string,
  studentId: string,
  onUpdate: (payload: SyncStatePayload) => void,
  onError: (error: string) => void
) {
  if (!supabase) {
    onError('Supabase client is not initialized.');
    return { unsubscribe: () => {} };
  }

  let active = true;
  let channel: any = null;

  // Single function to fetch current state and build local payload
  const fetchAndSync = async () => {
    if (!active) return;
    try {
      // 1. Fetch room details
      const { data: dbRoom, error: roomError } = await fetchRoom(roomCode);

      if (roomError || !dbRoom) {
        const isObj = typeof roomError === 'object' && roomError !== null;
        const errCode = isObj ? (roomError as any).code : '';
        const errMsg = isObj ? ((roomError as any).message || String(roomError)) : String(roomError || 'Failed to fetch classroom info.');

        if (errCode === 'PGRST116') {
          onError('The classroom room code was not found.');
        } else {
          onError(errMsg);
        }
        return;
      }

      const room = normalizeRoom(dbRoom);
      if (!room) return;

      const dbCode = dbRoom.room_code || dbRoom.code || roomCode.trim();

      // 2. Fetch all students in room
      const { data: dbStudents } = await supabase
        .from('students')
        .select('*')
        .eq('room_code', dbCode);

      const students = dbStudents || [];
      const studentsCount = students.length;

      // Map DB students to type-safe Student model
      const mappedStudents: Student[] = students.map((s: any) => ({
        id: s.id,
        name: s.name,
        socketId: '', // Restored offline
        score: parseFloat(s.score || 0),
        streak: parseInt(s.streak || 0),
        correctCount: parseInt(s.correct_count || s.score || 0),
        joinedAt: Number(s.joined_at || (s.updated_at ? new Date(s.updated_at).getTime() : Date.now())),
        lastActive: Number(s.last_active || (s.updated_at ? new Date(s.updated_at).getTime() : Date.now()))
      }));

      // Find current student profile
      const student = mappedStudents.find((s) => s.id === studentId) || null;

      // 3. Fetch submissions
      const { data: dbSubmissions } = await supabase
        .from('submissions')
        .select('*')
        .eq('room_code', dbCode);

      const submissions = dbSubmissions || [];
      const submissionsCount = submissions.length;

      // Map submissions
      const mappedSubmissions: Submission[] = submissions.map((s: any) => ({
        studentId: s.student_id,
        studentName: s.student_name,
        answer: s.selected_option || s.choice || s.answer || '',
        isCorrect: s.is_correct !== undefined ? !!s.is_correct : false,
        timestamp: Number(s.speed_ms || s.timestamp || 0),
        points: parseFloat(s.points || 0),
        rank: parseInt(s.rank || 0),
        activityId: s.activity_id || ''
      }));

      // 4. Fetch student's own confusion vote
      const { data: dbConfusion } = await supabase
        .from('confusion_votes')
        .select('*')
        .eq('room_code', dbCode)
        .eq('student_id', studentId)
        .maybeSingle();

      const studentConfusionVote = dbConfusion 
        ? (dbConfusion.level || dbConfusion.status) as 'understood' | 'partial' | 'confused' 
        : null;

      const activities = room.activities;
      const currentActivityIndex = room.current_activity_index;
      let activeActivity = currentActivityIndex >= 0 && currentActivityIndex < activities.length
        ? activities[currentActivityIndex]
        : null;

      if (!activeActivity && room.directActivity) {
        activeActivity = room.directActivity;
      } else if (activeActivity && room.directActivity) {
        activeActivity = {
          ...activeActivity,
          ...room.directActivity
        };
      }

      // Filter studentSubmission so it only matches if it's for the current active activity
      let studentSubmission: Submission | null = null;
      if (activeActivity) {
        const actId = activeActivity.id || 'current_check';
        studentSubmission = mappedSubmissions.find((s: any) => 
          s.studentId === studentId && s.activityId === actId
        ) || null;
      }

      // 5. Fetch Active Polls
      const { data: dbPolls } = await supabase
        .from('active_polls')
        .select('*')
        .eq('room_code', dbCode);

      let activePoll = null;
      if (dbPolls && dbPolls.length > 0) {
        const p = dbPolls.find((poll: any) => poll.is_active) || dbPolls[0];
        if (p) {
          activePoll = {
            id: p.id,
            question: p.question,
            options: p.options || [],
            isActive: p.is_active !== undefined ? !!p.is_active : true,
            votes: typeof p.votes === 'string' ? JSON.parse(p.votes) : (p.votes || {}),
            totalVotes: p.total_votes || 0,
          };
        }
      }

      // 6. Fetch Q&A Questions
      const { data: dbQuestions } = await supabase
        .from('qa_questions')
        .select('*')
        .eq('room_code', dbCode);

      const questions = (dbQuestions || []).map((q: any) => ({
        id: q.id,
        studentName: q.student_name || 'Classmate',
        questionText: q.question_text || '',
        text: q.question_text || '', // fallback
        timestamp: q.created_at ? new Date(q.created_at).getTime() : Date.now(),
        votes: q.votes || 0,
        upvotes: q.votes || 0, // fallback
        isAnswered: q.is_answered !== undefined ? !!q.is_answered : false,
        answerText: q.answer_text || '',
      }));

      // 7. Build sorted leaderboard
      const leaderboard = [...mappedStudents]
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.joinedAt - b.joinedAt;
        })
        .map((s, idx) => ({
          ...s,
          rank: idx + 1
        }));

      // Assign precise ranks considering identical scores
      let currentRank = 1;
      for (let i = 0; i < leaderboard.length; i++) {
        if (i > 0 && leaderboard[i].score < leaderboard[i - 1].score) {
          currentRank = i + 1;
        }
        leaderboard[i].rank = currentRank;
      }

      // Map db state directly to the exact state for automatic tab alignment
      const mappedState = (room.state || 'lobby') as RoomState;

      // Assemble final payload
      const syncPayload: SyncStatePayload = {
        roomCode: room.code,
        teacherName: room.teacher_name || 'Teacher',
        subject: room.subject || 'Lecture Hall',
        state: mappedState,
        studentsCount,
        currentActivityIndex,
        activitiesCount: activities.length,
        timeRemaining: room.time_remaining,
        activeActivity,
        student,
        submissionsCount,
        studentSubmission,
        studentConfusionVote,
        leaderboard,
        questions,
        activityStatus: room.activity_status,
        activePoll
      };

      if (active) {
        onUpdate(syncPayload);
      }

      // Initialize real-time channel with exact casing code
      if (!channel && active) {
        channel = supabase.channel(`room_sync_${dbCode}`)
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'rooms', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'rooms', 
            filter: `code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'students', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'submissions', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'confusion_votes', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'active_polls', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'qa_questions', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .subscribe((status) => {
            console.log(`Realtime channel subscribed for exact dbCode ${dbCode}:`, status);
          });
      }
    } catch (e: any) {
      console.error('Error fetching room state:', e);
      onError(e.message || 'Connection synced failed.');
    }
  };

  // Run initial sync fetch
  fetchAndSync();

  // Robust backup polling interval every 3 seconds to guarantee instant alignment with external teacher apps
  const pollingInterval = setInterval(() => {
    fetchAndSync();
  }, 3000);

  return {
    unsubscribe: () => {
      active = false;
      clearInterval(pollingInterval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    }
  };
}

/**
 * Subscribe to classroom changes as a host/teacher and compile complete dashboard state
 */
export function subscribeToHostRoom(
  roomCode: string,
  onUpdate: (payload: any) => void,
  onError: (error: string) => void
) {
  if (!supabase) {
    onError('Supabase is not configured.');
    return { unsubscribe: () => {} };
  }

  let active = true;
  let channel: any = null;

  const fetchAndSync = async () => {
    if (!active) return;
    try {
      // 1. Fetch room details
      const { data: dbRoom, error: roomError } = await fetchRoom(roomCode);

      if (roomError || !dbRoom) {
        const errMsg = typeof roomError === 'object' && roomError !== null
          ? ((roomError as any).message || String(roomError))
          : String(roomError || 'Failed to fetch classroom info.');
        onError(errMsg);
        return;
      }

      const room = normalizeRoom(dbRoom);
      if (!room) return;

      const dbCode = dbRoom.room_code || dbRoom.code || roomCode.trim();

      // 2. Fetch all students in room
      const { data: dbStudents } = await supabase
        .from('students')
        .select('*')
        .eq('room_code', dbCode);

      const students = (dbStudents || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        socketId: '',
        score: parseFloat(s.score || 0),
        streak: parseInt(s.streak || 0),
        correctCount: parseInt(s.correct_count || s.score || 0),
        joinedAt: Number(s.joined_at || (s.updated_at ? new Date(s.updated_at).getTime() : Date.now())),
        lastActive: Number(s.last_active || (s.updated_at ? new Date(s.updated_at).getTime() : Date.now()))
      }));

      // 3. Fetch submissions
      const { data: dbSubmissions } = await supabase
        .from('submissions')
        .select('*')
        .eq('room_code', dbCode);

      const submissions = (dbSubmissions || []).map((s: any) => ({
        studentId: s.student_id,
        studentName: s.student_name,
        answer: s.selected_option || s.choice || s.answer || '',
        isCorrect: s.is_correct !== undefined ? !!s.is_correct : false,
        timestamp: Number(s.speed_ms || s.timestamp || 0),
        points: parseFloat(s.points || 0),
        rank: parseInt(s.rank || 0)
      }));

      // 4. Fetch all confusion votes
      const { data: dbConfusion } = await supabase
        .from('confusion_votes')
        .select('*')
        .eq('room_code', dbCode);

      const confusionVotes: Record<string, string> = {};
      (dbConfusion || []).forEach((c: any) => {
        confusionVotes[c.student_id] = c.level || c.status || 'understood';
      });

      // Assemble final host payload
      const hostPayload = {
        code: room.code,
        teacherName: room.teacher_name,
        subject: room.subject,
        state: room.state,
        currentActivityIndex: room.current_activity_index,
        timeRemaining: room.time_remaining,
        activities: room.activities,
        students,
        submissions,
        confusionVotes
      };

      if (active) {
        onUpdate(hostPayload);
      }

      // Initialize real-time channel with exact casing code
      if (!channel && active) {
        channel = supabase.channel(`host_sync_${dbCode}`)
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'rooms', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'rooms', 
            filter: `code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'students', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'submissions', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'confusion_votes', 
            filter: `room_code=eq.${dbCode}` 
          }, () => {
            fetchAndSync();
          })
          .subscribe((status) => {
            console.log(`Realtime host channel subscribed for exact dbCode ${dbCode}:`, status);
          });
      }
    } catch (e: any) {
      console.error('Error fetching host sync:', e);
      onError(e.message || 'Host connection synced failed.');
    }
  };

  // Run initial sync fetch
  fetchAndSync();

  // Robust backup polling interval every 3 seconds to guarantee instant alignment with external teacher apps
  const pollingInterval = setInterval(() => {
    fetchAndSync();
  }, 3000);

  return {
    unsubscribe: () => {
      active = false;
      clearInterval(pollingInterval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    }
  };
}

/**
 * Update room state in Supabase supporting all schema patterns safely
 */
export async function updateRoomStateSupabase(
  roomCode: string,
  updates: {
    state?: string;
    current_activity_index?: number;
    time_remaining?: number;
    activities?: Activity[];
  }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };
  
  const original = roomCode.trim();
  const upper = original.toUpperCase();
  const lower = original.toLowerCase();
  const codesToTry = Array.from(new Set([original, upper, lower]));
  
  const dbPayload: any = {};
  if (updates.state !== undefined) {
    dbPayload.state = updates.state;
  }
  if (updates.current_activity_index !== undefined) {
    dbPayload.current_activity_index = updates.current_activity_index;
    dbPayload.current_activity_id = String(updates.current_activity_index);
  }
  if (updates.time_remaining !== undefined) {
    dbPayload.time_remaining = updates.time_remaining;
    dbPayload.timer_remaining = updates.time_remaining;
  }
  if (updates.activities !== undefined) {
    dbPayload.activities = JSON.stringify(updates.activities);
  }
  dbPayload.updated_at = new Date().toISOString();

  // Try room_code first
  const { error } = await supabase
    .from('rooms')
    .update(dbPayload)
    .in('room_code', codesToTry);

  if (error) {
    // Retry on legacy code column
    const { error: secondError } = await supabase
      .from('rooms')
      .update(dbPayload)
      .in('code', codesToTry);

    if (secondError) {
      return { success: false, error: 'Failed to update state: ' + secondError.message };
    }
  }

  return { success: true };
}

/**
 * Delete submissions for a given room code
 */
export async function clearSubmissionsSupabase(roomCode: string): Promise<void> {
  if (!supabase) return;
  const original = roomCode.trim();
  const upper = original.toUpperCase();
  const lower = original.toLowerCase();
  const codesToTry = Array.from(new Set([original, upper, lower]));
  
  await supabase
    .from('submissions')
    .delete()
    .in('room_code', codesToTry);
}

/**
 * Delete confusion votes for a given room code
 */
export async function clearConfusionVotesSupabase(roomCode: string): Promise<void> {
  if (!supabase) return;
  const original = roomCode.trim();
  const upper = original.toUpperCase();
  const lower = original.toLowerCase();
  const codesToTry = Array.from(new Set([original, upper, lower]));

  await supabase
    .from('confusion_votes')
    .delete()
    .in('room_code', codesToTry);
}

/**
 * Create a new classroom room in Supabase
 */
export async function createRoomSupabase(
  subject: string,
  teacherName: string,
  activities: Activity[]
): Promise<{ success: boolean; roomCode?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const payload = {
    room_code: code,
    code: code,
    teacher_name: teacherName,
    subject_name: subject,
    subject: subject,
    state: 'lobby',
    activities: JSON.stringify(activities),
    current_activity_index: -1,
    current_activity_id: '-1',
    time_remaining: 0,
    timer_remaining: 0,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('rooms')
    .insert([payload]);

  if (error) {
    const corePayload = {
      room_code: code,
      teacher_name: teacherName,
      subject_name: subject,
      state: 'lobby',
      updated_at: new Date().toISOString()
    };

    const { error: secondError } = await supabase
      .from('rooms')
      .insert([corePayload]);

    if (secondError) {
      return { success: false, error: 'Failed to create classroom: ' + secondError.message };
    }
  }

  return { success: true, roomCode: code };
}

/**
 * Submit a vote for an active poll
 */
export async function submitPollVoteSupabase(
  roomCode: string,
  pollId: string,
  optionIndex: number,
  currentVotes: Record<string, number>,
  currentTotalVotes: number
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };
  try {
    const updatedVotes = { ...currentVotes };
    updatedVotes[optionIndex] = (Number(updatedVotes[optionIndex]) || 0) + 1;
    
    const { error } = await supabase
      .from('active_polls')
      .update({
        votes: updatedVotes,
        total_votes: (Number(currentTotalVotes) || 0) + 1
      })
      .eq('id', pollId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Post a new Q&A question
 */
export async function submitQaQuestionSupabase(
  roomCode: string,
  studentName: string,
  questionText: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await supabase
      .from('qa_questions')
      .insert([{
        room_code: roomCode.toUpperCase().trim(),
        student_name: studentName,
        question_text: questionText,
        votes: 0,
        is_answered: false,
        answer_text: '',
        created_at: new Date().toISOString()
      }]);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Upvote a Q&A question
 */
export async function upvoteQaQuestionSupabase(
  questionId: string,
  currentVotes: number
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };
  try {
    const { error } = await supabase
      .from('qa_questions')
      .update({
        votes: (Number(currentVotes) || 0) + 1
      })
      .eq('id', questionId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Update student's points and streak in database
 */
export async function updateStudentPointsSupabase(
  studentId: string,
  pointsToAdd: number,
  isCorrect: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };
  try {
    const { data: std, error: fetchErr } = await supabase
      .from('students')
      .select('score, streak')
      .eq('id', studentId)
      .single();
    
    if (fetchErr || !std) {
      return { success: false, error: fetchErr?.message || 'Student profile not found.' };
    }

    const currentScore = Number(std.score || 0);
    const currentStreak = Number(std.streak || 0);

    const nextScore = isCorrect ? parseFloat((currentScore + pointsToAdd).toFixed(2)) : currentScore;
    const nextStreak = isCorrect ? (currentStreak + 1) : 0;

    const { error } = await supabase
      .from('students')
      .update({
        score: nextScore,
        streak: nextStreak,
        last_active: new Date().toISOString()
      })
      .eq('id', studentId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Submit speedtyper records to Supabase
 */
export async function submitSpeedtyperRecordSupabase(
  roomCode: string,
  studentId: string,
  studentName: string,
  wpm: number,
  accuracy: number,
  timeTaken: number,
  word: string = ''
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured' };
  try {
    const code = roomCode.toUpperCase().trim();
    const record = {
      room_code: code,
      student_name: studentName,
      word: word.substring(0, 255),
      time_seconds: parseFloat(timeTaken.toFixed(2)),
      wpm: Math.round(wpm),
      accuracy: Math.round(accuracy),
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('speedtyper_records')
      .insert([record]);

    if (error) {
      // Fallback in case of customized schemas
      const fallbackRecord = {
        room_code: code,
        student_id: studentId,
        student_name: studentName,
        wpm: Math.round(wpm),
        accuracy: Math.round(accuracy),
        time: parseFloat(timeTaken.toFixed(2)),
        time_taken: parseFloat(timeTaken.toFixed(2)),
        time_spent: parseFloat(timeTaken.toFixed(2)),
        created_at: new Date().toISOString()
      };
      const { error: error2 } = await supabase
        .from('speedtyper_records')
        .insert([fallbackRecord]);
      if (error2) {
        return { success: false, error: error2.message };
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error occurred.' };
  }
}
