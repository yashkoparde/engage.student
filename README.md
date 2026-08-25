# 📱 Engage Student — Real-Time Classroom Companion Client

An ultra-responsive, mobile-first student client designed for instant participation in live classroom lectures, gamified quizzes, interactive 3D flashcards, typing battles, and comprehension feedback.

---

## 🚀 Overview

**Engage Student** turns any smartphone, tablet, or laptop into an interactive classroom response clicker and learning console. Students connect via a lightweight 6-digit room PIN, join the live lobby, and seamlessly follow along as the instructor launches synchronized activities.

```
+-----------------------------------------------------------------------------+
|                           ENGAGE STUDENT CLIENT                             |
|                                                                             |
|  +-----------------------------------------------------------------------+  |
|  |  Room PIN: #AURA1    |    Avatar: 🦊 Alex    |    Points: 1,450 pts   |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  +-------------------------------------+  +------------------------------+  |
|  |        Live Activity Arena          |  |    Active Feedback Drawer    |  |
|  |  - Instant Multi-Choice Quizzes     |  |  - "I'm Confused" One-Tap    |  |
|  |  - 3D Flashcards & Self-Ratings     |  |  - Anonymous Q&A Queries     |  |
|  |  - Real-time Keystroke Typer        |  |  - Realtime Circular Timer   |  |
|  +-------------------------------------+  +------------------------------+  |
+-----------------------------------------------------------------------------+
```

---

## ✨ Key Features

### 🔑 1. Frictionless Onboarding & PIN Join
- **Instant Room Entry**: Quick 6-digit alphanumeric room PIN validation with auto-focus and uppercase formatting.
- **Custom Identity**: Avatar selection carousel with personalized nicknames.
- **Connection Resilience**: Automatic heartbeat reconnection and session recovery on network blips.

### ⏱️ 2. Dynamic SVG Circular Timer
- **Real-Time Visual Countdown**: Hardware-accelerated SVG stroke-dashoffset countdown animation.
- **Urgency Color Transitions**: Dynamic smooth color gradients shifting from Emerald Green to Amber to Crimson as time expires.
- **End Chime & Pulse**: Subtle visual pulse and audio tick cues during the final seconds.

### 📊 3. Interactive Multi-Activity Engine
- **Live MCQ & Polls**: Tap-to-submit choices with instant visual feedback and answer distribution reveals.
- **3D Flashcards**: Flip cards to explore definitions and rate understanding levels (*Mastered*, *Reviewing*, *Confused*).
- **Speed Typer Arena**: Live real-time keystroke racer measuring WPM, accuracy, and race track progress.
- **Gamified Celebrations**: Canvas-confetti bursts on correct quiz answers and podium placements.

### 🙋 4. Real-Time Confusion & Pace Feedback
- **One-Tap Pace Check**: Discreetly signal understanding level (*Understood*, *Getting Lost*, or *Confused*) without interrupting the class.
- **Quick Question Chips**: Submit predefined queries (*"Explain again"*, *"Too fast"*, *"Example please"*) or custom inquiries.
- **Anonymous Crowd Q&A**: Upvote peer questions to help the instructor address high-priority topics.

### 🏆 5. Live Classroom Leaderboard
- **Top 3 Podium**: Gold, silver, and bronze badges with animated score progressions.
- **Sticky Personal Banner**: Always displays the student's current standing, streak count, and score delta (+100 pts) regardless of scroll position.

---

## 🛠️ Technology Stack

- **Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Build Tool**: [Vite 5](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (Mobile-First, Dark Glassmorphism)
- **Real-Time Pub/Sub**: [Supabase Realtime](https://supabase.com/realtime) WebSockets
- **Backend Orchestrator**: [Node.js](https://nodejs.org/) + TypeScript (`server.ts`)
- **Icons & Visuals**: [Lucide React](https://lucide.dev/) + [Canvas Confetti](https://www.npmjs.com/package/canvas-confetti)

---

## 📁 Project Structure

```
engage-student/
├── src/
│   ├── components/
│   │   ├── CircularTimer.tsx    # SVG countdown timer with color gradients
│   │   ├── ConfusionView.tsx    # Live pace check & confusion feedback drawer
│   │   ├── LeaderboardView.tsx  # Podium & real-time rank tracker
│   │   ├── Splash.tsx           # PIN entry & avatar onboarding
│   │   └── StudentView.tsx      # Master activity container & renderer
│   ├── lib/
│   │   └── supabase.ts          # Realtime client wrapper & offline queue
│   ├── defaultActivities.ts     # Activity seed templates & fallback fixtures
│   ├── types.ts                 # Student domain TypeScript interfaces
│   ├── index.css                # Tailwind base styles & glassmorphism theme
│   ├── App.tsx                  # Root state machine & student lifecycle
│   └── main.tsx                 # React entrypoint
├── server.ts                    # Backend orchestration & socket server
├── supabase_schema.sql          # Relational SQL schema & RLS policies
├── plan.md                      # High-concurrency system architecture specs
├── metadata.json                # Application metadata
├── index.html                   # Mobile-first viewport document
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configurations
└── package.json                 # Dependencies and build scripts
```

---

## ⚡ Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm** / **yarn**

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/yashkoparde/engage.student.git
cd engage.student

# Install dependencies
npm install
```

### 3. Database Setup (Optional for Cloud Mode)
Execute the [`supabase_schema.sql`](supabase_schema.sql) script in your Supabase SQL Editor to provision tables, indexes, and realtime publications.

### 4. Environment Setup
Configure your `.env` file:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 5. Running the Client
```bash
# Start Vite development server
npm run dev

# Open http://localhost:5173 on your browser or mobile device
```

### 6. Running the Optional Backend Server
```bash
# Start standalone backend server
npx ts-node server.ts
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
