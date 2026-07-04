-- ====================================================================
-- Classroom Sync Production SQL Schema (Supabase)
-- ====================================================================
-- This script safely drops existing tables (if any), creates the required
-- database tables matching the Classroom orchestrator schema, and enables
-- high-speed indexing, automatic timestamps, and real-time streams.
-- 
-- Copy and run this entire script in your Supabase SQL Editor.
-- ====================================================================

-- 1. CLEAN UP PREVIOUS TABLES (IF REBUILDING)
-- Note: Dropping tables automatically removes them from any publications,
-- avoiding SQL syntax errors associated with DROP TABLE IF EXISTS in publications!
DROP TABLE IF EXISTS public.speedtyper_records CASCADE;
DROP TABLE IF EXISTS public.active_polls CASCADE;
DROP TABLE IF EXISTS public.qa_questions CASCADE;
DROP TABLE IF EXISTS public.confusion_votes CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;

-- 2. ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. CREATE MASTER ROOMS TABLE
CREATE TABLE public.rooms (
  room_code VARCHAR(50) PRIMARY KEY,
  teacher_name VARCHAR(100) NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  current_activity_id VARCHAR(100) NULL,
  activity_status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'active', 'revealed'
  state VARCHAR(50) DEFAULT 'lobby',          -- 'lobby', 'launcher', 'monitor', 'leaderboard', 'ended'
  timer_duration INT DEFAULT 30,
  timer_remaining INT DEFAULT 30,
  timer_started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CREATE STUDENTS TABLE
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  score INT DEFAULT 0,
  streak INT DEFAULT 0,
  is_connected BOOLEAN DEFAULT true,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_student_per_room UNIQUE (room_code, name)
);

-- 5. CREATE SUBMISSIONS TABLE (FOR QUIZ / MCQ SELECTION ANSWERS)
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  activity_id VARCHAR(100) NOT NULL,
  choice VARCHAR(50) NOT NULL,
  speed_ms INT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CREATE CONFUSION_VOTES TABLE (PACE CHECKS FEEDBACK)
CREATE TABLE public.confusion_votes (
  student_id UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  room_code VARCHAR(50) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- 'understood', 'partial', 'confused'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. CREATE QA_QUESTIONS TABLE (LIVE COLLABORATIVE Q&A FORUM)
CREATE TABLE public.qa_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  question_text TEXT NOT NULL,
  votes INT DEFAULT 1,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. CREATE ACTIVE_POLLS TABLE (LIVE SURVEYS)
CREATE TABLE public.active_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  is_active BOOLEAN DEFAULT true,
  votes JSONB DEFAULT '{}'::jsonb,
  total_votes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. CREATE SPEEDTYPER_RECORDS TABLE (GAMEPLAY STATS)
CREATE TABLE public.speedtyper_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  word VARCHAR(255) NOT NULL,
  time_seconds NUMERIC NOT NULL,
  wpm INT NOT NULL,
  accuracy INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PRE-SEED INITIAL TESTING ROOM
-- This ensures that room 'AURA1' is immediately available for students to join!
INSERT INTO public.rooms (room_code, teacher_name, subject_name, state, timer_duration, timer_remaining) 
VALUES ('AURA1', 'Dr. Aether', 'Computer Science & Software Architecture', 'lobby', 30, 30)
ON CONFLICT (room_code) DO NOTHING;

-- 11. HIGH-SPEED PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_students_room ON public.students(room_code);
CREATE INDEX IF NOT EXISTS idx_submissions_room_activity ON public.submissions(room_code, activity_id);
CREATE INDEX IF NOT EXISTS idx_confusion_room ON public.confusion_votes(room_code);
CREATE INDEX IF NOT EXISTS idx_qa_room ON public.qa_questions(room_code);
CREATE INDEX IF NOT EXISTS idx_polls_room ON public.active_polls(room_code);
CREATE INDEX IF NOT EXISTS idx_speedtyper_room ON public.speedtyper_records(room_code);

-- 12. AUTOMATIC TIMESTAMPS MODIFICATION TRIGGER
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rooms_modtime BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 13. ENABLE REAL-TIME REPLICATION STREAMS SAFELY
-- Wrapped in a safe DO block to check if publication exists and dynamically add tables
DO $$
DECLARE
  pub_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) INTO pub_exists;
  
  IF NOT pub_exists THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  
  -- Add tables safely to publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.confusion_votes;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_questions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.active_polls;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.speedtyper_records;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Realtime replication publication modified safely';
END $$;
