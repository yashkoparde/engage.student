# Classroom Sync Plan: Scalable Real-Time Gamification

This document details the architecture, data models, high-concurrency optimizations, and Supabase configuration required to build and integrate the matching Teacher/Faculty Portal with the Aether Student Portal, supporting 300 to 400 simultaneous students.

---

## 1. Credentials and Sandbox Setup
For development, staging, and sandbox scaling verification, use the following default configurations:

- Teacher Credentials:
  - Login Email: faculty.admin@aether-edu.org
  - Password: aetherFacultySecure2026!
  - Default Active Room Code: AURA1
- Student Profile Requirements:
  - Student Identifier: Unique UUID or generated string
  - Entry Flow: Authorized Room Code and Name validation

---

## 2. High-Concurrency Traffic Logic and Synchronous Student Sync

To stream and process real-time events from 300 to 400 concurrent students without experiencing data loss or browser thread blocks, a hybrid Optimistic State + Row-Level Real-time Pub/Sub architecture is utilized.

### State Partitioning and Deduplication
- **Unique Identification**: Every student session maintains a unique UUID. A database-level unique constraint on the composite key (room_code, name) prevents duplicate active connections in a single room.
- **Atomic Submissions**: Submissions are uniquely keyed by (student_id, activity_id) to avoid double-submission overhead and race conditions during high-speed entries.

### Real-Time Pub/Sub and Channel Filtering
- **Supabase Broadcast Channels**: The Teacher Dashboard subscribes to database changes on the rooms, students, and submissions tables filtered on the active Room Code.
- **Event-Driven UI**: Updates are streamed directly via WebSockets, ensuring live UI rendering only takes place when database state increments.

### Client-Side Throttling and Batching
- **Aggregated Comprehension Metrics**: Rapid student inputs (e.g. continuous updating of understanding levels in the Live Confusion Meter) are handled on the server by writing directly.
- **Debounced Calculations**: Instead of triggering full React component re-renders on the teacher's dashboard for every single change event, incoming events are queued and metrics are calculated using low-overhead debounced state triggers.

---

## 3. Complete Reconciled Production SQL Script

Execute this single, unified script in your Supabase SQL Editor. This script merges both datasets, installs the required extensions, creates the necessary high-speed performance indexes, sets up automatic updated_at timestamp triggers, and enables real-time WebSocket streams for all tables.

```sql
-- 1. CLEAN UP PREVIOUS TABLES (IF REBUILDING)
DROP TABLE IF EXISTS public.confusion_votes CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;

-- 2. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. CREATE MASTER ROOMS TABLE
CREATE TABLE public.rooms (
  room_code VARCHAR(10) PRIMARY KEY,
  teacher_name VARCHAR(100) NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  current_activity_id VARCHAR(50),
  activity_status VARCHAR(20) DEFAULT 'idle', -- 'idle', 'active', 'revealed'
  state VARCHAR(20) DEFAULT 'lobby',          -- 'lobby', 'launcher', 'monitor', 'leaderboard', 'ended'
  timer_duration INT DEFAULT 30,
  timer_remaining INT DEFAULT 30,
  timer_started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CREATE STUDENTS ENROLLMENT TABLE
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(10) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  score INT DEFAULT 0,
  streak INT DEFAULT 0,
  is_connected BOOLEAN DEFAULT true,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  confusion_status VARCHAR(20) DEFAULT 'understood', -- 'understood', 'partial', 'confused'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_student_per_room UNIQUE (room_code, name)
);

-- 5. CREATE SUBMISSIONS RECORD TABLE (FOR LIVE MCQ ACTIVITIES)
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(10) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  activity_id VARCHAR(50) NOT NULL,
  choice VARCHAR(5) NOT NULL,               -- 'A', 'B', 'C', 'D'
  speed_ms INT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CREATE LIVE CONFUSION METRIC TABLE
CREATE TABLE public.confusion_votes (
  student_id UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  room_code VARCHAR(10) REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,              -- 'understood', 'partial', 'confused'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. OPTIMIZATION INDEXES (Critical for high-speed concurrent sorting & queries)
CREATE INDEX idx_students_room_code ON public.students(room_code);
CREATE INDEX idx_students_is_connected ON public.students(is_connected);
CREATE INDEX idx_students_score ON public.students(room_code, score DESC);
CREATE INDEX idx_submissions_room_activity ON public.submissions(room_code, activity_id);
CREATE INDEX idx_submissions_student ON public.submissions(student_id);

-- 8. ENABLE REALTIME PUBLICATIONS (WebSocket streaming synchronization)
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.confusion_votes;

-- 9. AUTOMATIC TIMESTAMP UPDATE TRIGGER
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rooms_modtime BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_students_modtime BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION update_modified_column();
```

---

## 4. Google AI Studio Prompt to Generate the Teacher Portal

Provide the following prompt to Google AI Studio to build the matching Teacher/Faculty Dashboard:

```text
Build a professional, interactive, full-stack Teacher/Faculty Dashboard for managing gamified classrooms in real time, connecting to a shared Supabase database.

Aesthetic Guidelines:
- Visual Theme: Matte slate and dark-indigo backgrounds, deep charcoal cards, pure crisp text labels, and clean high-contrast elements.
- Iconography: Use standard icons from the 'lucide-react' library. Do NOT use emojis, emoticons, or custom raw inline SVG markup anywhere in the code.
- Animations: Smooth, hardware-accelerated entry transitions, staggers, and scaling interactive feedbacks using the framer-motion library.

Circular Navigation Hub:
- Implement a centralized cockpit containing five prominent circular button hubs for navigation and stage controls.
- Each circular navigation hub triggers active database updates to synchronize the student screens in real time:
  1. Lobby Circle: Sets 'rooms.state' to 'lobby'. Visualizes total active students with clean metrics.
  2. Launcher Circle: Allows selecting specific activities and clicking "Launch" to push question keys and start the synchronized countdown.
  3. Real-Time Monitor Circle: Aggregates student answer choices (bar distribution chart) and live confusion ratios (donut metric chart) with throttled updates.
  4. Leaderboard Circle: Displays live cumulative student standings, scores, and correct streaks.
  5. End Session Circle: Controls classroom finalization.

Confirmation Mechanism for Session Ending:
- Clicking the End Session control must trigger an elegant overlay modal instead of standard browser popups.
- The modal is styled with an atmospheric dark glassmorphism blur, subtle scaling entry transitions, and rose-tinted indicator labels warning of the finality of ending the session.
- Pre-saved student states and final score logs are protected until explicit confirmation is submitted.
```
