# CHORUS

**Collaborative generative art — your voice, face and hands are the brush.**

CHORUS is a browser-based creative suite built around one idea: painting shouldn't need a mouse. A particle system watches your face and hands through the webcam and listens through the microphone, then turns your expression into color, shape and motion in real time. That emotional canvas is the heart of the project, and around it grew a small constellation of connected tools — a shared multiplayer canvas with mini-games, a live face-particle mirror with 17 camera effects, a full 3D sculpting studio, an AI sketch-to-website generator, and a social feed with competitions — all sitting on one account system and one Supabase backend.

Built solo, end-to-end (design, client, server, database, deployment), for the **Hack the Arts** hackathon.

> Author: **Viktor Nedev** — [viktornedev08@gmail.com](mailto:viktornedev08@gmail.com)

---

## Table of contents

- [Modes](#modes)
- [How the brush works](#how-the-brush-works)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Deploying your own copy](#deploying-your-own-copy)
- [Environment variables](#environment-variables)

---

## Modes

### 🎨 Solo
Paint alone on a full toolbar, not just a single particle brush. Eleven tools live side by side: the emotion-driven **Chorus** particle brush, **Hand Draw** (trace with your fingertip, open palm to pause), freehand **Brush** (7 styles: soft brush, pen, pencil, marker, calligraphy, spray, neon glow), **Lines** (straight/wave/dashed/arrow/zigzag), **Shapes** (circle, rect, triangle, star, heart…), click-to-explode **Burst**, flood-fill **Fill**, click-or-dictate **Text**, cursor-steered **Voice paint**, marquee **Select** (cut/move/copy a region) and an **Eyedropper**. Undo/redo, adjustable canvas presets, and — on save — an AI-generated short poem about the piece you just made (via Gemini), stored alongside the artwork.

### 👥 Collective
Up to 8 people share one live canvas from different devices, joining with a 4-letter room code. Every participant is rendered as their own swarm of particles, driven by their own webcam/mic in real time, so you literally see everyone's emotional state moving on the same canvas at once. Includes a room chat, emoji reactions, live camera thumbnails of every participant, and a built-in **Game Arena** with five host-run mini-games — Pictionary, Impostor, Draw-prompt, Memory and Blind-draw — complete with round phases, timers, scoring and a podium screen.

### 🪞 Mirror (MoodCheck)
A live face-particle mirror: MediaPipe reconstructs your face and hands as a moving particle mesh you can push through **17 camera effects** — Thermal, Point cloud, Voxel, Hologram, Wireframe, Neon, Spectral, Night-vision, X-ray, Sepia, Negative, Posterize, Duotone, Contour, Mosaic, Halftone and Glitch — either full-screen or framed inside a "lens" you shape with your own fingers. Supports voice commands, and photo/video capture of the result.

### 🗿 Sculpt
A real 3D modeling studio in the browser (Three.js / React Three Fiber): primitive shapes, a freehand 3D pen, lathe and extrude tools, procedural terrain, and a live audio-reactive performance mode where geometry moves to music or your voice. Finished scenes export to **GLB, OBJ, STL, PLY, USDZ (AR Quick Look) or a PNG snapshot**.

### 🌐 WebForge
Sketch a wireframe on a canvas, and Gemini turns it into a real, working website — HTML/CSS/JS or a small React/backend project, generated and editable in a Monaco code editor. A **site-palette color-fidelity system** keeps the colors you actually drew consistent throughout the generated code (instead of the model inventing its own palette), and a **visual click-to-edit** mode lets you click any element on the live preview and describe a change in plain language instead of hand-editing code. Supports multi-page sites, voice-dictated edit instructions, one-click publish to Supabase Storage with a shareable URL, and project export as a `.zip`. Locally, generated backends can even be spun up in an isolated Docker sandbox (`Dockerfile.sandbox`, via `dockerode`) so generated server code never touches the host.

### 📱 Social & Compete
A feed for published artwork — likes, comments, follows, a leaderboard, seasonal category awards and unlockable badges — plus themed, timed **competitions**: submit an existing artwork as your entry, the community votes, and a winner is decided when the clock runs out.

### 👤 Profile / Gallery
Personal stats, achievement levels and arena points (earned in Collective's Game Arena) computed straight from Supabase, alongside a private gallery of everything you've saved across Solo and Sculpt.

---

## How the brush works

The "emotion is the brush" mechanic is a small real-time pipeline that runs entirely in the browser:

1. **MediaPipe Tasks Vision** (`FaceLandmarker` + `HandLandmarker`, running on-device via WASM/GPU) extracts face blendshapes and hand landmarks from the webcam feed, frame by frame.
2. **`emotionMapper.js`** turns face blendshapes into one of six emotional states — happy, sad, angry, surprised, focused, neutral — each with its own color and particle shape:

   | Emotion | Look |
   |---|---|
   | happy | gold circles |
   | sad | blue falling dots |
   | angry | red spikes |
   | surprised | cyan bursts |
   | focused | mint triangles, orbiting |
   | neutral | your personal color |

3. **`gestureMapper.js`** turns hand landmarks into a swarm behavior:

   | Gesture | Effect |
   |---|---|
   | 🖐 Open palm | particles scatter around your hand |
   | ✊ Fist | particles condense tightly |
   | ✌️ Peace | particles split into two groups |
   | 👉 Point | particles form a line |

4. **`audioAnalyzer.js`** runs an FFT over the mic input and splits it into bass/mid/treble bands, which feed **`swarmRules.js`** to make the particles pulse and swell with sound.
5. **`ParticleSystem.js`** is the actual swarm simulation (steering/flocking forces + noise via `simplex-noise`), rendered every frame through **p5.js in instance mode** inside `P5Canvas.jsx` — so multiple independent canvases (Solo, each participant in Collective, the Mirror) can run side by side without global-state collisions.

All of this — face tracking, hand tracking, audio analysis, particle simulation — runs client-side. No video or audio ever leaves the browser.

---

## Architecture

CHORUS intentionally supports **two backends** so it works both as a quick local dev stack and as a fully hosted, database-backed product:

- **Local dev**: a Node/Express server (`server/`) with **Socket.io** for realtime (Collective rooms, chat, cursors), flat JSON files for storage, and the Gemini SDK server-side for AI.
- **Hosted / production**: **Supabase** (Postgres + Auth + Storage + Realtime) as the entire backend, with **Vercel serverless functions** (`api/poem.js`, `api/webforge.js`) standing in for the AI endpoints — since a static Vercel deployment can't reach `localhost` or hold a persistent Socket.io connection.

Every data hook (`useSocial`, `useArtworkStore`, `useCompetitions`, `useAvatars`) checks whether Supabase is configured and picks its backend automatically, so the same UI code runs unmodified in both environments — a hosted demo and a `git clone && npm run dev` both just work.

The most involved part of this split is **Collective**, which normally needs a persistent WebSocket server. `useRealtimeSession.js` reimplements the exact same public interface as the Socket.io-based `useSocket.js` (rooms, presence, chat, drawing strokes, camera frames, game events) on top of **Supabase Realtime** — presence channels for who's online, broadcast channels for everything that used to be a socket event — with a **host-authoritative** game engine (`arenaEngine.js` + the pure, unit-tested `arenaGames.js`) so only one client ever owns round timers and scoring. Because the interface matches 1:1, `CollectiveCanvas.jsx` and every game overlay component didn't need to change at all when the transport underneath them did.

A one-time `supabase/setup.sql` script provisions the entire schema — 17 tables, ~60 row-level-security policies, Storage buckets, and Postgres RPCs for points/wins — idempotently, so it's safe to re-run.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS |
| Generative canvas | p5.js (instance mode), custom particle/swarm engine |
| Computer vision | MediaPipe Tasks Vision — `FaceLandmarker` (blendshapes) + `HandLandmarker` |
| Audio | Web Audio API (FFT → bass/mid/treble), Web Speech API (dictation & voice commands) |
| 3D | Three.js, React Three Fiber, `@react-three/drei` |
| 2D vector canvas | Fabric.js (WebForge sketch → wireframe capture) |
| Code editor | Monaco Editor (WebForge generated-code editing) |
| AI | Google Gemini (`gemini-2.5-flash` / `gemini-2.5-flash-lite`) for poems and WebForge sketch analysis / site generation / chat-edit |
| Realtime (local) | Socket.io 4 |
| Realtime (hosted) | Supabase Realtime (Presence + Broadcast) |
| Auth & database | Supabase (Postgres, Auth, Row-Level Security) |
| Storage | Supabase Storage (published artworks & WebForge sites) / local JSON (dev fallback) |
| Backend (local) | Node.js + Express, `dockerode` for sandboxed WebForge backend execution |
| Serverless (hosted) | Vercel Functions |
| Misc | GSAP & Lenis (motion/scroll), JSZip (project export), `simplex-noise` (particle flow fields), Split.js (resizable panels) |

---

## Project structure

```
chorus/
├── client/                  React + Vite app
│   ├── src/pages/           Landing, SoloCanvas, CollectiveCanvas, MoodCheck,
│   │                        Sculpt, WebForge, Social, Compete, Gallery,
│   │                        Profile, Auth
│   ├── src/components/      UI, grouped per mode (collective/, moodcheck/,
│   │                        sculpt/, webforge/, social/, solo/) + shared
│   │                        Icon system, HUD, NavOrb, camera/particle canvases
│   ├── src/engine/          Pure logic: ParticleSystem, emotionMapper,
│   │                        gestureMapper, swarmRules, audioAnalyzer,
│   │                        arenaGames, sitePalette, sketchAnalyzer,
│   │                        htmlEdit, sculpt/ (exporters, geometry)
│   ├── src/hooks/           useMediaPipe, useAudio, useAuth, useSocial,
│   │                        useArtworkStore, useSocket / useRealtimeSession,
│   │                        useCollectiveSession, useCompetitions, useWebforge…
│   └── public/icons/        268 custom neon duotone icons (replacing emoji UI-wide)
├── server/                  Express + Socket.io (local dev backend + AI/games)
├── api/                     Vercel serverless functions (poem, webforge AI)
├── supabase/                setup.sql (schema, RLS, storage, RPCs)
├── vercel.json               Rewrites + function config for hosted deploy
└── docker-compose.yml / Dockerfile.sandbox   Local stack + WebForge sandbox image
```

---

## Running locally

```bash
# 1. Server
cd server
npm install
# put your key in server/.env → GEMINI_API_KEY=...
npm run dev          # → http://localhost:3001

# 2. Client (second terminal)
cd client
npm install
npm run dev          # → http://localhost:5173
```

Open http://localhost:5173 and allow camera + microphone access.

**Testing Collective on localhost:** open two browser windows (one can be Incognito), create a session in one and join with its code in the other.

---

## Deploying your own copy

The hosted client (Vercel) can't reach `localhost:3001`, so a production deploy routes everything through **Supabase + Vercel functions** instead of the Express server:

**1. Database (required)** — Supabase → **SQL Editor** → paste in `supabase/setup.sql` → **Run**. Creates every table, RLS policy and Storage bucket. Safe to re-run.

**2. AI (poems + WebForge)** — Vercel → Settings → Environment Variables → add `GEMINI_API_KEY` (same key as `server/.env`) → **Redeploy**. AI now runs through `api/poem.js` and `api/webforge.js` on the same domain — no CORS, no Supabase CLI needed.

**3. Auth** — Supabase → Authentication → Email **on**, "Confirm email" **off**; Authentication → URL Configuration → Site URL = your Vercel domain. Vercel needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**4. `VITE_SERVER_URL`** — in production this must **not** point at `localhost`. Delete it (or point it at a hosted Node server, if you're running one).

With that in place, Collective runs entirely on **Supabase Realtime** (rooms, shared canvas, chat, reactions, camera thumbnails, Game Arena) and needs no dedicated server. Locally, without Supabase configured, it falls back to Socket.io against `server/` automatically.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `server/.env` (local) / Vercel env (hosted) | Poems + WebForge AI generation |
| `VITE_SUPABASE_URL` | `client/.env` / Vercel env | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `client/.env` / Vercel env | Supabase anon/public key |
| `VITE_SERVER_URL` | `client/.env` (local only) | Local Express/Socket.io server URL — must be unset in production |
| `CLIENT_URL` | `server/.env` | CORS origin for the local Express server |
