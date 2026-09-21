# 🧊 Ice Breaker — Live Quiz Platform

<p align="center"><strong>A real-time, coordinator-controlled multiplayer quiz experience built for live events.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-149eca?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169e1?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
</p>

> Break the ice. Start the timer. Let the chaos begin.

Ice Breaker is a browser-based multiplayer quiz platform for college events, clubs, classrooms, team activities, and live gatherings. Participants answer timed questions while a coordinator controls the session and monitors the leaderboard in real time.

## ✨ Highlights

- 👥 Participant registration using name and USN
- ⚡ Live, coordinator-controlled quiz rounds
- ⏱️ Synchronized countdowns based on server time
- 🔐 Server-side validation for active question, timer, lock state, and duplicate submissions
- 🧠 MCQ, image-based MCQ, and emoji guessing rounds
- 🏆 Live leaderboard with deterministic ranking
- 📡 Server-Sent Events (SSE) for instant session and score updates
- 🖥️ Projector-friendly leaderboard and final podium view
- 🛠️ Admin controls for release, lock, reveal, next, previous, end, and player removal
- ♻️ Full session reset for reuse across events
- 🚦 Lightweight caching, request coalescing, database indexes, and rate limiting

## 🎮 Quiz Format

| Section | Format | Default Timer |
|---|---|---:|
| Section 1 | Kahoot-style MCQ and image MCQ | 10 seconds |
| Section 2 | Knowledge and pop-culture MCQ | 10 seconds |
| Section 3 | Emoji-based guessing | 20 seconds |

The question bank is maintained in `src/lib/questions.ts`.

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │     PostgreSQL      │
                    │ players             │
                    │ player_answers      │
                    │ quiz_session_state  │
                    └──────────┬──────────┘
                               │
                         pg / SQL
                               │
             ┌─────────────────┴─────────────────┐
             │          Next.js 16               │
             │                                  │
             │ Player APIs                      │
             │ Admin APIs                       │
             │ Leaderboard API                  │
             │ Server-Sent Events endpoint     │
             └───────────────┬──────────────────┘
                             │
                 ┌───────────┼───────────┐
                 │           │           │
              Player       Admin      Projector
              Browser      Console      Screen
```

### Answer submission flow

```text
Player submits answer
        ↓
Validate registration and session state
        ↓
Verify active question and timer
        ↓
Verify lock state and duplicate submission
        ↓
Grade answer on the server
        ↓
Persist answer and update player score
        ↓
Invalidate leaderboard cache
        ↓
Broadcast leaderboard-update through SSE
```

## 🔐 Server-Authoritative Validation

The API does not trust the browser's timer or local state. Each submission is checked against the server/database state:

- Player must be registered
- Session must not be ended
- Submitted question must be the active question
- Question must have been released
- Answers must not be locked
- Server-side timer must not have expired
- Player must not have answered the same question already

### Scoring

- **MCQ / image MCQ:** 10 points for a correct answer, 0 for an incorrect answer
- **Emoji round:** 5 points are assigned for a submitted answer; correctness is recorded separately

The authoritative implementation is located at `src/app/api/submit-answer/route.ts`.

## 🗃️ Database Schema

The database is initialized automatically through `src/lib/db.ts`.

### `players`

Stores participant identity and aggregate results.

- `id`
- `name`
- `usn` — unique identifier
- `score`
- `correct_count`
- `completed`

### `player_answers`

Stores submitted answers and grading information.

- `id`
- `player_usn`
- `question_index`
- `selected_answer`
- `is_correct`
- `points_earned`
- `submitted_at`

### `quiz_session_state`

Stores the active session state.

- `current_question_index`
- `timer_start_time`
- `timer_duration`
- `show_answers`
- `is_locked`
- `is_ended`
- `leaderboard_revealed`

Indexes are created for USN lookup, answer lookup, question lookup, and leaderboard ordering.

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 |
| UI | React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 and custom CSS |
| Database | PostgreSQL |
| Database driver | `pg` |
| Realtime | Server-Sent Events (SSE) |
| Synchronization | HTTP polling + SSE |
| Caching | In-memory TTL cache with request coalescing |
| Rate limiting | In-memory sliding-window limiter |
| Runtime | Node.js |

## 📁 Project Structure

```text
ice_breaking/
├── public/assets/       # Quiz images and static assets
├── src/app/
│   ├── admin/           # Coordinator dashboard
│   ├── api/
│   │   ├── admin/       # Session controls and reset
│   │   ├── leaderboard/ # Leaderboard API
│   │   ├── register/    # Player registration
│   │   ├── session-state/# Session state API
│   │   ├── sse/         # Server-Sent Events stream
│   │   └── submit-answer/# Answer validation and scoring
│   ├── leaderboard/     # Public leaderboard display
│   └── page.tsx         # Player experience
└── src/lib/
    ├── cache.ts
    ├── db.ts
    ├── events.ts
    ├── questions.ts
    ├── rate-limiter.ts
    └── useSSE.ts
```

## 🔌 Routes and APIs

### Browser routes

| Route | Purpose |
|---|---|
| `/` | Player registration and quiz experience |
| `/admin` | Coordinator console |
| `/leaderboard` | Live scoreboard and projector display |

### API routes

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/register` | Register or reconnect a player |
| `GET` | `/api/session-state` | Read active session state |
| `POST` | `/api/submit-answer` | Validate, grade, and save an answer |
| `GET` | `/api/leaderboard` | Read ranked players |
| `GET` | `/api/sse` | Subscribe to realtime events |
| `POST` | `/api/admin/control` | Manage the live session |
| `POST` | `/api/admin/reset` | Clear players, answers, and session state |

Admin actions include `status`, `release`, `lock`, `reveal`, `next`, `prev`, `end`, `remove-player`, `reveal-leaderboard`, and `hide-leaderboard`.

## 🧑‍💻 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/DIVYANK-BHARDWAJ/ice_breaking.git
cd ice_breaking
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env.local`:

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
ADMIN_PASSWORD=your-secure-admin-password
```

`DATABASE_URL` is required. Set an explicit, strong `ADMIN_PASSWORD` before any real deployment.

The required PostgreSQL tables and indexes are created automatically when the application first accesses the database.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Production commands

```bash
npm run build
npm run start
npm run lint
```

## 🎯 Recommended Event Workflow

1. Start the application.
2. Open `/admin` on the coordinator device.
3. Ask participants to register at `/`.
4. Release the current question.
5. Let participants answer during the timer.
6. Lock submissions and reveal answers when required.
7. Move to the next question.
8. End the session after the final round.
9. Reveal the leaderboard and use projector mode for the podium.

## ⚙️ Performance Characteristics

- PostgreSQL connection pooling through `pg.Pool`
- Short-lived caching for session state and leaderboard data
- Request coalescing for concurrent identical reads
- Database indexes for frequent lookups
- SSE notifications with polling as a synchronization fallback
- In-memory rate limiting for admin requests

## 🛡️ Security and Deployment Notes

This project is designed for a controlled live-event environment and is not yet a hardened public SaaS platform.

Before exposing it publicly:

- Set a strong `ADMIN_PASSWORD`
- Use HTTPS
- Add robust administrator authentication and session management
- Avoid exposing sensitive participant information
- Use distributed caching, pub/sub, and rate limiting when horizontally scaling
- Review PostgreSQL network access and credentials
- Protect or restrict the admin and reset endpoints

The current cache, event broadcaster, and rate limiter are process-local. The application is therefore best suited to a single running instance unless a shared coordination layer is introduced.

## 🧩 Customization

Quiz content is centralized in `src/lib/questions.ts`.

```ts
interface Question {
  section: string;
  type: 'mcq' | 'mcq-image' | 'emoji';
  question: string;
  options?: string[];
  images?: string[];
  answer: number | string;
  timer: number;
}
```

You can extend the question bank with new MCQs, image questions, emoji puzzles, sections, timers, and local assets.

## 🧭 Future Improvements

- Multiple simultaneous quiz rooms
- Team-based gameplay
- Persistent event history and analytics
- Custom quiz builder
- Organizer accounts
- Redis-backed realtime coordination
- Distributed rate limiting
- QR-code joining
- CSV participant import
- Per-round statistics and reports

## 👨‍💻 Author

Built by **Divyank Bhardwaj**.

- GitHub: [@DIVYANK-BHARDWAJ](https://github.com/DIVYANK-BHARDWAJ)
- Repository: [ice_breaking](https://github.com/DIVYANK-BHARDWAJ/ice_breaking)

## 📄 License

No license file is currently included. Unless a license is added, the repository remains subject to the author's default copyright rights.

---

<p align="center"><strong>Break the ice. Start the timer. Let the chaos begin. 🧊</strong></p>
