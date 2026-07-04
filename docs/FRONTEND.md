# Frontend Architecture (YTshortsFE)

**What this covers:** the React app that drives the Shorts studio — toolchain, the `App.jsx` state model, the API client, the polling hook, and the end-to-end user flow. **Backend cross-refs:** the API contract is in [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md); the endpoints in [../../YTshortsAnimation/docs/03-BACKEND-API.md](../../YTshortsAnimation/docs/03-BACKEND-API.md).

> This app is a **thin client**. It renders a form from backend data, submits a job, polls until the video appears, and plays it. All real work happens in the backend repo.

---

## Toolchain

**Vite 6** — dev server (`npm run dev`), build (`npm run build`), preview. `vite.config.js` pins **port 5173**:

```js
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
})
```

⚠️ **5173 is not cosmetic.** The backend's CORS allowlist only admits `localhost:5173`/`5174`. If Vite starts elsewhere (both busy → 5175), every API call fails with a CORS error that the UI misreports as "backend unreachable".

**React 19** — used minimally: `createRoot` + `StrictMode` in `main.jsx`, plus plain hooks/refs. Nothing 19-specific (no `useOptimistic`, `use()`, form actions) — the app would run on React 18 unchanged. ⚠️ **StrictMode double-fires effects in dev**, so the mount `Promise.all` runs twice and you'll see duplicate requests in the network tab — harmless (idempotent GETs), just don't be alarmed.

**Tailwind v4 (CSS-first)** — the *entire* config is:
- `src/index.css` → one line: `@import "tailwindcss";`
- Tailwind wired as a **Vite plugin** (`@tailwindcss/vite`).
- **No `tailwind.config.js`, no `postcss.config.js`.**

⚠️ If you search for Tailwind help online and find `tailwind.config.js` / `content: [...]` / `@tailwind base;` instructions, that's **v3** — a different setup. In v4 you'd customize the theme with an `@theme {}` block in the CSS. This app uses none — all styling is stock utility classes inline in JSX (a hardcoded dark slate/indigo theme; there is no light mode).

**Environment** — `.env` has one variable:
```
VITE_API_BASE=http://localhost:8000
```
Only `VITE_`-prefixed vars are exposed to client code (via `import.meta.env`). ⚠️ It's **baked into the JS bundle at build time**, not read at runtime — deploying elsewhere means rebuilding with a different value.

---

## Project structure

```
src/
├── main.jsx                    React entry: createRoot(<StrictMode><App/></StrictMode>)
├── index.css                   @import "tailwindcss";   (the whole Tailwind config)
├── App.jsx                     THE state owner — all 18 useState, effects, handlers
├── api/client.js               The ONLY module that knows backend URLs & shapes
├── hooks/
│   └── useGenerationJob.js      submit + poll state machine
├── lib/
│   └── estimate.js             word-count → seconds estimate
└── components/                 12 stateless controlled inputs + StickerTimeline
```

No router, no state library (Redux/Zustand), no fetch wrapper (axios), no UI kit. Everything is hand-rolled: raw `fetch`, `useState`, and prop drilling from `App.jsx` to 13 children.

---

## `App.jsx` — the complete state model

One component owns everything (no context, no reducer). **18 `useState` + 1 `useRef` + 1 custom hook.**

### Form state (user-editable)

| State | Initial | Wire field | Notes |
|---|---|---|---|
| `text` | `''` | `text` | the script |
| `voice` | `''` | `voice` | backend default fills it on load |
| `voiceDescription` | `''` | `voice_description` | Parler style prompt |
| `speed` | **`1.2`** | `speed` | ⚠️ frontend-owned default (not backend-driven) |
| `clip` | `''` | `clip` | backend default fills it |
| `background` | `'black'` | `background` | frontend-owned; 2-value toggle |
| `split` | `''` | `split` | backend default fills it |
| `music` | `''` (=None) | `music` | sent as `null` when `''` |
| `musicVolume` | `0.18` | `music_volume` | ⚠️ duplicated default (also from backend) |
| `placements` | `[]` | `stickers` | client `id` stripped before sending |
| `uploads` | `[]` | (files) | session-only `{key,label,file,url}` |
| `showOutro` | `true` | `show_outro` | frontend-owned |

### Backend-loaded options
`voices`, `clips`, `splits`, `musicOptions`, `health` (all start empty/null), plus `loadError`.

### Probe / timeline state
`timelineDuration` (null = timeline locked), `timelineWords` (word timings for the voice strip), `probeId`, `probing` (spinner flag).

### Ref
`uploadSeq` — a monotonic counter so upload keys stay unique across removals (array length would recycle keys after a delete; a ref survives re-renders without triggering them).

---

## Effects

**Effect #1 — mount load:**
```js
Promise.all([getVoices(), getClips(), getSplits(), getMusic(), getHealth()])
```
On success, sets each option list *and* its default selection (`music: null → ''`, `musicVolume ← default_volume`). ⚠️ `Promise.all` is **all-or-nothing** — one failing endpoint blanks the whole form and shows the "backend unreachable" banner (which embeds `VITE_API_BASE`). Fires twice under StrictMode dev.

**Effect #2 — probe invalidation:** deps `[text, voice, speed, voiceDescription]`. Any change nulls `timelineDuration`/`timelineWords`/`probeId`, re-locking the sticker timeline — because a probe's measured duration is only valid for the exact inputs it measured (`voiceDescription` is included because for Parler a different prompt = different audio = different duration). ⚠️ It fires on **every keystroke** in the script box, and it does **NOT** clear `placements` — so old sticker blocks can outlive the timeline they were drawn against.

---

## Derived values & handlers

**Derived (per render):**
- `selectedVoice = voices.find(v => v.id === voice)`
- `isParler = selectedVoice?.engine === 'parler'` — gates the `VoiceDescriptionInput` (placeholder = the voice's `default_description`).
- `canGenerate = text.trim() && voice && clip && split && !isBusy` — note music/background/outro are **not** required.
- `measured = job?.duration ?? null` — the backend's real narration length, preferred over the estimate once polling returns it.

**Handlers:**
- `handleLoadTimeline` — `probeDuration({text, voice, speed, voiceDescription})`, sets duration/words/probeId; on error reuses `loadError` (⚠️ so probe errors show in the connectivity banner slot and never auto-clear).
- `handleAddFiles(fileList)` — per file: sanitize name (`replace(/[^\w.-]+/g, '_')`), `key = \`${uploadSeq.current++}_${safe}\``, store `{key, label, file, url: URL.createObjectURL(file)}`. The object URL is the in-browser preview.
- `handleRemoveUpload(key)` — revokes the object URL (memory hygiene) *and* drops any placements referencing it (referential-integrity cleanup).
- `handleGenerate` — the serialization step:
  - strip client-only `id` from each placement (`placements.map(({id, ...rest}) => rest)`),
  - compute `usedKeys` and send **only** uploads actually referenced by a placement (unplaced uploads never leave the browser),
  - force `voiceDescription: isParler ? voiceDescription : ''`,
  - call the hook's `start({...12 fields...})`.

---

## `api/client.js` — the only URL-aware module

Base URL: `const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'` (⚠️ this fallback is duplicated in `App.jsx`'s error message).

**`request(path, options)`** — the private helper: `fetch`, and on non-2xx it extracts FastAPI's `detail` (falling back to `statusText`; `JSON.stringify`ing it if `detail` is an array, as 422s are). Throws `Error`; returns `res.json()` on success. ⚠️ **No timeout, no retry, no AbortController** — a hung backend hangs the promise forever.

| Function | Method + Path | Returns |
|---|---|---|
| `getHealth()` | GET /api/health | `{ffmpeg, outro, ...}` |
| `getVoices()` | GET /api/voices | `{voices, default}` |
| `getClips()` | GET /api/clips | `{clips, default}` |
| `getSplits()` | GET /api/splits | `{splits, default}` |
| `getMusic()` | GET /api/music | `{music, default, default_volume}` |
| `probeDuration({...})` | POST /api/probe (JSON) | `{duration, words, probe_id}` |
| `probeAudioUrl(probeId)` | (URL builder) | mp3 URL for `<audio>` / waveform |
| `createJob({...})` | POST /api/generate (multipart) | `{id}` |
| `getJob(id)` | GET /api/jobs/{id} | job snapshot |
| `videoUrl(id)` | (URL builder) | mp4 URL for `<video>` / download |

Note the two **URL-builder** functions (`probeAudioUrl`, `videoUrl`) that return raw URLs for `<audio>`/`<video>` elements, versus the JSON functions that go through `request()`. The **camelCase↔snake_case** translation happens **only here** (`voiceDescription` → `voice_description`, etc.).

**`createJob` multipart mechanics:**
```js
const form = new FormData()
form.append('payload', JSON.stringify({ text, voice, voice_description, speed, clip,
   background, split, stickers, show_outro, music: music || null, music_volume }))
for (const f of files) form.append('files', f.file, f.key)   // 3rd arg = filename = the key
// ⚠️ do NOT set Content-Type — the browser must set the multipart boundary itself
```
The **filename-as-foreign-key** trick (`f.key` as the multipart filename, matching each `stickers[].image`) is the crux of the sticker system — see [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md).

---

## `useGenerationJob` — the submit/poll state machine

```
        start(options)                 poll every 1000ms (recursive setTimeout)
 idle ───────────────▶ submitting ──▶ running ──┬── status 'done'  ──▶ done
                            │  (createJob)       ├── status 'error' ──▶ error
                            └─ throw ──▶ error   └── any fetch throw ─▶ error
 reset() ───────────────────────────────────────────────────────────▶ idle
```

- `POLL_MS = 1000` — hardcoded 1s interval.
- **Recursive `setTimeout`, not `setInterval`** — deliberately, so a slow response never overlaps the next poll.
- ⚠️ **One failed poll (a transient network blip) immediately flips to `error`** — there's no retry and no way to re-attach to a job that's still running server-side. The job id isn't surfaced for recovery.
- `reset()` returns to idle but **never cancels the server-side job** (there's no cancel endpoint).
- Cleanup: `useEffect(() => clearTimer, [clearTimer])` clears the timer on unmount (but doesn't abort an in-flight fetch).
- `isBusy = phase === 'submitting' || 'running'` drives every form control's `disabled`.

---

## `lib/estimate.js`

- `BASE_WPM = 150` — assumed narration pace at 1.0× (edge Indian-English voices land ~there). ⚠️ Not tuned for Parler.
- `MAX_SECONDS = 60` — the Shorts limit.
- `estimateSeconds(text, speed) = words / (150 * speed) * 60`.
- `countWords` splits on whitespace. ⚠️ It counts emotion tags like `[excited]` as words even though they're never spoken — a small systematic overestimate on tagged scripts.
- ⚠️ **`isLikelyTooLong` is dead code** — exported but never imported; `ScriptInput` re-derives the comparison inline.

The estimate is advisory only — nothing blocks generating a 5-minute script (though it would then fail at the stitch stage; see backend M7).

---

## End-to-end user flow

1. **Page load** → 5 parallel GETs populate every dropdown + default; missing ffmpeg → amber warning; `health.outro` gates the outro toggle.
2. **Type script** (optionally insert emotion-tag samples via ExpressionGuide). Live word count + `~Xs at Y× speed` estimate; warns over 60s (advisory).
3. **Pick voice** — if Parler, a style-prompt textarea appears. Set speed (1.2 default), clip, background, split, music + volume, outro (on by default).
4. **Optional stickers** — upload images, "Load timeline" (POST /api/probe), drag time-range blocks against real narration seconds. Editing text/voice/speed/description re-locks the timeline.
5. **Generate** (enabled only with text + voice + clip + split) → multipart POST → `{id}` → phase `running` → poll every 1s → `ProgressStages` shows voice/captions/stitch.
6. **Done** → `VideoResult` plays + downloads the mp4; "Generate another" resets. **Error** → error box + "Start over".

⚠️ All state (including uploads) is **session-only** — a page refresh loses everything.

---

## Consolidated flags

- **Hardcoded:** `localhost:8000` fallback (×2), `POLL_MS=1000`, `BASE_WPM=150`, `MAX_SECONDS=60`, speed default `1.2`, musicVolume `0.18` (×2), background `'black'`, `winget install Gyan.FFmpeg` string in JSX, dark theme in class strings, port 5173.
- **Dead/stale:** `isLikelyTooLong` unused; `useGenerationJob.js` comment says options = `{text,voice,speed,clip}` (actually 12 fields); README component list omits ~6 components.
- **Fragile:** `Promise.all` all-or-nothing boot; one transient poll failure kills tracking; no fetch timeouts; `VITE_API_BASE` baked at build time; probe invalidation on every keystroke while `placements` survive; emotion tags counted as words; reset doesn't cancel server work.
- **Worth teaching:** filename-as-foreign-key multipart; backend-as-source-of-truth for all registries; recursive `setTimeout` polling; URL-builders vs JSON `request()`; camel↔snake confined to `client.js`; `isParler` gating from the voice registry's `engine` field.

---

## Key takeaways

- Thin client: renders backend-driven dropdowns, submits a multipart job, polls, plays the result. No router/state-lib/axios.
- All state lives in `App.jsx` (18 useState); components are controlled and stateless.
- `client.js` is the only URL-aware module and the sole camelCase↔snake_case boundary.
- Toolchain load-bearing bits: Vite port 5173 (CORS), Tailwind v4 CSS-first, `VITE_API_BASE` baked at build.
- Main fragilities: all-or-nothing boot, no fetch timeouts, one poll failure kills tracking, session-only state.
