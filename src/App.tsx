/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import Splash from './components/Splash.js';
import StudentView from './components/StudentView.js';
import { SyncStatePayload } from './types.js';
import { isSupabaseConfigured, subscribeToRoom } from './lib/supabase.js';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Persistence parameters for student
  const [savedRoomCode, setSavedRoomCode] = useState(() => localStorage.getItem('aura_room_code') || '');
  const [savedStudentId, setSavedStudentId] = useState(() => localStorage.getItem('aura_student_id') || '');
  const [savedName, setSavedName] = useState(() => localStorage.getItem('aura_student_name') || '');

  // Sync state payload for the active student
  const [studentSync, setStudentSync] = useState<SyncStatePayload | null>(null);

  // 1. Initialize Socket Client once (fallback/development mode if Supabase is not configured)
  useEffect(() => {
    if (isSupabaseConfigured()) {
      setIsConnected(true);
      return;
    }

    const socketClient = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    setSocket(socketClient);

    socketClient.on('connect', () => {
      setIsConnected(true);
      console.log('Socket paired successfully:', socketClient.id);

      // Reconnection Session Sync Check for student
      const activeRoom = localStorage.getItem('aura_room_code');
      const activeId = localStorage.getItem('aura_student_id');

      if (activeRoom && activeId) {
        socketClient.emit('sync:request', {
          roomCode: activeRoom,
          studentId: activeId,
          role: 'student',
        });
      }
    });

    socketClient.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket pairing lost.');
    });

    // Real-time student sync payload from WebSocket
    socketClient.on('room:sync', (payload: SyncStatePayload) => {
      setStudentSync(payload);
    });

    // Catch failed sync sessions gracefully
    socketClient.on('sync:failed', ({ error }) => {
      console.warn('Sync failed:', error);
      localStorage.clear();
      setStudentSync(null);
    });

    return () => {
      socketClient.disconnect();
    };
  }, []);

  // 2. Initialize Supabase Student Subscriptions
  useEffect(() => {
    if (!isSupabaseConfigured() || !savedRoomCode || !savedStudentId) {
      return;
    }

    console.log('[Supabase Student Sync] Establishing subscription for Room:', savedRoomCode);
    
    const subscription = subscribeToRoom(
      savedRoomCode,
      savedStudentId,
      (payload) => {
        setStudentSync(payload);
        setIsConnected(true);
      },
      (error) => {
        console.warn('[Supabase Student Sync] Error or expired session:', error);
        setIsConnected(false);
        setStudentSync(null);
        setSavedRoomCode('');
        setSavedStudentId('');
        localStorage.removeItem('aura_room_code');
        localStorage.removeItem('aura_student_id');
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [savedRoomCode, savedStudentId]);

  // Handle room parameters in URL (e.g., ?room=CS302)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      setSavedRoomCode(urlRoom.toUpperCase());
    }
  }, []);

  // Student join callback
  const handleStudentJoinSuccess = (roomCode: string, studentId: string, name: string) => {
    localStorage.setItem('aura_active_role', 'student');
    localStorage.setItem('aura_room_code', roomCode);
    localStorage.setItem('aura_student_id', studentId);
    localStorage.setItem('aura_student_name', name);

    setSavedRoomCode(roomCode);
    setSavedStudentId(studentId);
    setSavedName(name);

    if (!isSupabaseConfigured()) {
      // Trigger immediate manual sync request over standard Socket
      socket?.emit('sync:request', { roomCode, studentId, role: 'student' });
    }
  };

  // Safe manual exit/refresh helper
  const handleExitLobby = () => {
    localStorage.clear();
    setStudentSync(null);
    setSavedRoomCode('');
    setSavedStudentId('');
    setSavedName('');
    // Remove search query from URL
    window.history.pushState({}, document.title, window.location.pathname);
  };

  // Render Splash Screen initially
  if (showSplash) {
    return <Splash onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div className="relative min-h-screen bg-[#070913] text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-white">
      {/* Dynamic Animated Atmospheric Glowing Radial Backgrounds */}
      <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-[#0e1630] via-[#080d1e]/40 to-transparent opacity-60 pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-blue-500/10 via-violet-500/5 to-transparent blur-[80px] pointer-events-none" />

      {/* Grid texture background */}
      <div 
        className="absolute inset-0 opacity-[0.02] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Immersive Mobile-First Floating Exit Buttons */}
      {savedRoomCode && (
        <button
          onClick={handleExitLobby}
          className="fixed top-4 right-4 z-50 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a0e21]/90 hover:bg-[#12193b] border border-white/[0.06] hover:border-white/10 text-slate-400 hover:text-white text-[10px] font-mono font-bold tracking-wider uppercase transition-all shadow-xl backdrop-blur-md cursor-pointer"
        >
          Exit Class
        </button>
      )}

      {/* Primary Application View Frame (Responsive Mobile-First width) */}
      <main className="relative flex-1 z-10 w-full mx-auto flex flex-col justify-start py-4 px-3 sm:px-6 max-w-md sm:max-w-lg">
        <AnimatePresence mode="wait">
          <motion.div
            key="student-flow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full flex flex-col justify-center"
          >
            <StudentView 
              socket={socket} 
              syncState={studentSync} 
              onJoinSuccess={handleStudentJoinSuccess}
              savedRoomCode={savedRoomCode}
              savedStudentId={savedStudentId}
              savedName={savedName}
            />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
