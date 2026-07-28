# CHORUS

Collaborative generative art — your **voice, face and hands** are the brush.

Two modes:
- **SOLO** — paint alone with a toolbar + live emotion/gesture/audio input. Save your artwork with an AI-generated poem.
- **COLLECTIVE** — up to 8 people share one canvas in real time. Each person is a swarm of 80 particles driven by their emotions.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, p5.js (instance mode), Tailwind CSS |
| Vision | MediaPipe Tasks Vision (FaceLandmarker blendshapes + HandLandmarker) |
| Audio | Web Audio API (FFT → bass/mid/treble) |
| Realtime | Socket.io 4 |
| AI | Gemini (`@google/generative-ai`) for poems |
| Storage | JSON files in `server/gallery/` (no DB needed) |

## Run locally

```bash
# 1. Server
cd server
npm install
# постави своя ключ в server/.env → GEMINI_API_KEY=...
npm run dev          # → http://localhost:3001

# 2. Client (втори терминал)
cd client
npm install
npm run dev          # → http://localhost:5173
```

Отвори http://localhost:5173, позволи камера + микрофон.

### Collective тест на localhost
Отвори два браузърни прозореца (единият може да е incognito), създай сесия в единия и влез с кода в другия.

## Deployment

- **client/** → Vercel (`vite build` → `dist/`), задай `VITE_SERVER_URL` env към Railway URL-а
- **server/** → Railway / Render (`node index.js`), задай `GEMINI_API_KEY` и `CLIENT_URL`

### Serverless (Supabase) — за да работят логин/регистрация и Social от всяко устройство

Хостнатият клиент на Vercel няма достъп до `localhost:3001`, затова auth и данните трябва да
минат през Supabase (иначе логин от телефон/друг лаптоп дава `ERR_CONNECTION_REFUSED`).

1. **Supabase Dashboard**
   - Project Settings → API → копирай **anon public** key.
   - Authentication → Providers → **Email** = on; за незабавен signup **изключи „Confirm email"**
     (иначе регистрацията иска email потвърждение). URL Configuration → Site URL = Vercel домейна.
   - SQL Editor → пусни `supabase/social.sql`, после `supabase/data.sql` (таблици + RLS +
     Storage bucket `artwork-videos`).
2. **Vercel → Settings → Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   → **Redeploy** (Vite вгражда env при билд).
3. **Локално** (по избор): същите стойности в `client/.env`. Празен ключ = автоматичен Express
   fallback (`localhost:3001`) — работи само на машината, която върти `/server`.

Остават сървърно-зависими (нужен хостнат Node сървър): **Collective** (Socket.io realtime),
**поеми** и **WebForge** (Gemini + hosting).

## Gestures

| Gesture | Effect |
|---|---|
| 🖐 Open palm | particles scatter around your hand |
| ✊ Fist | particles condense tightly |
| ✌️ Peace | particles split into two groups |
| 👉 Point | particles form a line |

## Emotions

happy → gold circles · sad → blue falling dots · angry → red spikes · surprised → cyan bursts · focused → mint triangles orbiting · neutral → your personal color
