# YTshortsFE

Web UI for the [Shorts Pipeline](../YTshortsAnimation) — turn a text script into a 9:16
(1080x1920) YouTube Short. Built with **React 19 + Vite + Tailwind v4**.

The UI is a thin client: it collects options, POSTs a job to the FastAPI backend, then polls
for per-stage progress and finally shows/downloads the rendered `final.mp4`.

> 📚 **Learning the frontend?** See **[`docs/FRONTEND.md`](docs/FRONTEND.md)** (architecture, state model,
> API client, polling), **[`docs/COMPONENTS.md`](docs/COMPONENTS.md)** (all 15 components), and
> **[`docs/STICKER-TIMELINE.md`](docs/STICKER-TIMELINE.md)** (the timeline editor deep dive). For the
> backend and the full system, start at [`../YTshortsAnimation/docs/00-START-HERE.md`](../YTshortsAnimation/docs/00-START-HERE.md).

## Project status (as of 2026-07-20)

This UI drives a local, single-user studio that turns a typed script into a finished 9:16 YouTube
Short — narrated by one of three TTS engines, with word-synced burned captions (in a selectable
visual style), looping gameplay footage, timed stickers (with slide-in animations and attached
sound effects), a video intro/outro, background music, and an optional "auto-generate scene
images" flow that uses an LLM (Groq) to plan images and a second Colab GPU (FLUX) to render them
directly onto the sticker timeline. It remains a thin client: all of that work happens in the
sibling [`YTshortsAnimation`](../YTshortsAnimation) backend, this app just renders the form,
uploads files, and polls two independent job types (renders and image-generation batches) until
they finish. Current branch is `feature-phase4-generate-image` — `main` is stale. See the backend's
[`docs/09-DEPENDENCIES.md`](../YTshortsAnimation/docs/09-DEPENDENCIES.md) if AI voices or AI images
aren't working; it's a backend setup step, not anything in this repo.

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
