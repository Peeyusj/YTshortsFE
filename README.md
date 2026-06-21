# YTshortsFE

Web UI for the [Shorts Pipeline](../YTshortsAnimation) — turn a text script into a 9:16
(1080x1920) YouTube Short. Built with **React 19 + Vite + Tailwind v4**.

The UI is a thin client: it collects options, POSTs a job to the FastAPI backend, then polls
for per-stage progress and finally shows/downloads the rendered `final.mp4`.

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
| Script text | `ScriptInput` | `text` |
| Voice (male/female) | `VoiceSelect` (options from `/api/voices`) | `voice` |
| Speed (1.0–2.0×) | `SpeedSlider` | `speed` |
| Gameplay clip | `ClipSelect` (options from `/api/clips`) | `clip` |
| Top background (black/white) | `BackgroundToggle` | `background` |

Voice and clip dropdowns are **backend-driven** — adding one in `config.py` server-side makes it
appear here with no frontend change. The background toggle is a fixed two-value control; captions
auto-pick a contrasting colour server-side, previewed by the `Aa` swatches.

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
