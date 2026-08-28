# YTshortsFE

Web UI for the [Shorts Pipeline](../YTshortsAnimation) — turn a text script into a 9:16
(1080x1920) YouTube Short. Built with **React 19 + Vite + Tailwind v4**.

The UI is a thin client: it collects options, POSTs a job to the FastAPI backend, then polls
for per-stage progress and finally shows/downloads the rendered `final.mp4`.

> 📚 **Learning the frontend?** See **[`docs/FRONTEND.md`](docs/FRONTEND.md)** (architecture, state model,
> API client, polling), **[`docs/COMPONENTS.md`](docs/COMPONENTS.md)** (all 25 components), and
> **[`docs/STICKER-TIMELINE.md`](docs/STICKER-TIMELINE.md)** (the timeline editor deep dive). For the
> backend and the full system, start at [`../YTshortsAnimation/docs/00-START-HERE.md`](../YTshortsAnimation/docs/00-START-HERE.md).
> **This README's "What you can configure" and "Structure" sections below are Phase-1 snapshots and
> have not kept pace with the app — treat `docs/` as current, this file as a lighter, partly-stale intro.**

## Project status (as of 2026-08-28)

This UI drives a local, single-user studio that turns a typed script into a finished YouTube Short
or landscape video — narrated by one of three TTS engines, with word-synced burned captions
(optional, repositionable, and optionally animated word-by-word) over a choice of canvas layouts
(classic 9:16 split with gameplay footage, or full-screen with no gameplay clip at all), timed
stickers (including configurable-strength zoom/pan "Ken Burns" motion, with attached sound
effects), a video intro/outro, a choice of end cards, background music, and an "auto-generate scene
images" flow (on by default) that uses an LLM (Groq) to plan images and pacing, then renders them
through a choice of three free image backends, directly onto the sticker timeline — optionally
conditioned on a saved, reusable **character**. A **"recent projects"** panel lets you reopen a past
finished render to tweak and re-render it. It remains a thin client: all of that work happens in
the sibling [`YTshortsAnimation`](../YTshortsAnimation) backend — this app just renders the form,
uploads files, and polls two independent job types (renders and image-generation batches) until
they finish. Current branch is `phase-6-multi-image-provider` — note this no longer matches the
backend repo's branch name (`phase-multi-image-provider`) exactly, the first time that's happened
since an early phase — `main` is stale in both. See the backend's
[`docs/09-DEPENDENCIES.md`](../YTshortsAnimation/docs/09-DEPENDENCIES.md) if AI voices or AI images
aren't working; it's a backend setup step, not anything in this repo. For exactly how the AI voice
and AI image features run on entirely free infrastructure (Colab, Cloudflare, Pollinations, and
Groq), see **"How this stays 100% free"** in the
[backend README](../YTshortsAnimation/README.md#how-this-stays-100-free).

## Prerequisites

The backend must be running first (see [`YTshortsAnimation`](../YTshortsAnimation) → *Backend*):

```powershell
cd ../YTshortsAnimation/backend
..\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

FFmpeg must be installed on the backend host for the final stitch stage; the UI shows a warning
banner (via `GET /api/health`) if it's missing.

## Run

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # production build
npm run preview  # preview the production build
```

The backend allows CORS from `localhost:5173/5174` by default. Override the API origin with a
`VITE_API_BASE` env var (defaults to `http://localhost:8000`).

## What you can configure

> ⚠️ This table is a **Phase 1 snapshot** and is now well behind the app — it doesn't list canvas/
> aspect ratio, caption position/animation/density, image transitions/Ken Burns strength, the
> character library, image-provider selection, outro-card choice, or "recent projects" reopening.
> For the complete, current control list, see [`docs/COMPONENTS.md`](docs/COMPONENTS.md) and the
> wiring map in [`docs/FRONTEND.md`](docs/FRONTEND.md) — treat those, not this table, as current.

| Control | Component | Sent as |
|---------|-----------|---------|
| Script text (+ emotion tags) | `ScriptInput` | `text` |
| Voice (English/Hindi) | `VoiceSelect` (options from `/api/voices`) | `voice` |
| Speed (1.0–2.0×) | `SpeedSlider` | `speed` |
| Gameplay clip | `ClipSelect` (options from `/api/clips`) | `clip` |
| Top background (black/white) | `BackgroundToggle` | `background` |
| Split (top/bottom) | `SplitSelect` (options from `/api/splits`) | `split` |
| Stickers (upload + timeline) | `StickerTimeline` (browser uploads) | `stickers` + image files |
| Outro card (2s, default on) | `OutroToggle` | `show_outro` |

Voice/clip/split dropdowns are **backend-driven** — adding one in `config.py` server-side makes it
appear here with no frontend change. The background toggle is a fixed two-value control; captions
auto-pick a contrasting colour server-side.

**Emotion tags** — wrap script text in `[excited]…[/excited]`, `[sad]…[/sad]`, or `[calm]…[/calm]`
to vary the voice for that part (tags are never spoken).

**Sticker timeline** — upload images from your computer (drag-drop or file picker; session-only,
no server library). Click *Load timeline* (calls `POST /api/probe` to measure the real narration
length), pick an uploaded image, then drag across the timeline to set its time range and choose a
position preset (left/center/right × upper/lower). It warns (doesn't block) past 5 stickers or
under 2s each. On Generate the chosen image files are sent with the metadata as **multipart/form-data**.

## Structure

```
src/
  api/client.js          # the ONLY module that knows backend URLs/shapes
  hooks/useGenerationJob.js  # start-a-job + poll-until-done state machine
  components/            # ScriptInput, VoiceSelect, SpeedSlider, ClipSelect,
                         #   BackgroundToggle, ProgressStages, VideoResult
  lib/estimate.js        # pre-generation duration estimate from word count
  App.jsx                # form state + layout
```

- All HTTP goes through `src/api/client.js`. Components and hooks never call `fetch` directly —
  if the API changes, that's the one file to update.
- `useGenerationJob` exposes a `phase` state machine (`idle → submitting → running → done|error`)
  plus the latest job snapshot, so `App.jsx` stays declarative.
