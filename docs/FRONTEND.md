# Frontend Architecture (YTshortsFE)

**What this covers:** the React app that drives the Shorts studio — toolchain, the `App.jsx` state model, the API client, the polling hook, and the end-to-end user flow. **Backend cross-refs:** the API contract is in [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md); the endpoints in [../../YTshortsAnimation/docs/03-BACKEND-API.md](../../YTshortsAnimation/docs/03-BACKEND-API.md).

> This app is a **thin client**. It renders a form from backend data, submits a job, polls until the video appears, and plays it. All real work happens in the backend repo.
>
> **Update:** the app grew substantially alongside the backend's Phase 3/4 work — sticker sound effects/animations/full-width mode, a caption-style picker, video intro/outro upload slots, a live 9:16 preview panel in the timeline, per-voice audio previews, and a whole second, optional "auto-generate scene images" flow with its own submit/poll hook. This revision covers all of it.

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
├── App.jsx                     THE state owner — well over 18 useState now, effects, handlers
├── api/client.js               The ONLY module that knows backend URLs & shapes (~19 functions)
├── hooks/
│   ├── useGenerationJob.js      submit + poll state machine (render jobs)
│   └── useSceneImages.js        NEW — the same pattern, for AI image-generation jobs
├── lib/
│   └── estimate.js             word-count → seconds estimate
└── components/                 15 components: the original 12 (StickerTimeline substantially
                                 extended) + AutoImageGenerator, CaptionStyleSelect, IntroOutroVideo
```

No router, no state library (Redux/Zustand), no fetch wrapper (axios), no UI kit. Everything is hand-rolled: raw `fetch`, `useState`, and prop drilling from `App.jsx` to its children. No new npm dependencies were added for any of this — it's all built on the existing primitives.

---

## `App.jsx` — the complete state model

One component owns everything (no context, no reducer). Well over 18 `useState` now, plus refs and two custom hooks.

### Form state (user-editable) — original 12

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
| `placements` | `[]` | `stickers` | client `id` stripped before sending; entries now also carry `full_width`/`animation`/`animation_duration`/`sound_id` |
| `uploads` | `[]` | (files) | session-only `{key,label,file,url}` |
| `showOutro` | `true` | `show_outro` | frontend-owned (the static-image outro card, unchanged) |

### Form state (new, added in Phase 3/4)

| State | Initial | Purpose | Wire field |
|---|---|---|---|
| `captionStyle` | `''` | selected caption preset id | `caption_style` |
| `autoImageOn` | `false` | AI-image panel toggle | — (UI-only) |
| `imageStyle` | `''` | selected AI image style id | sent to `generateScenes`, not `/api/generate` |
| `imageCount` | `5` | # of AI images to generate | sent to `generateScenes` |
| `imageCountBounds` | `{min:1,max:30}` | clamp for the count input, seeded from `getImageStyles()` | — |
| `generatedImages` | `[]` | finished AI images `{key,label,url,start,end}` | feeds `placements`, not sent directly |
| `introVideo` | `null` | `{key,name,file,url}` intro clip | `intro_video` (key) + `files` |
| `outroVideo` | `null` | `{key,name,file,url}` outro clip | `outro_video` (key) + `files` |
| `soundOptions` | `[]` | sound-effect registry for the sticker dropdown | — |
| `captionStyles` | `[]` | registry for `CaptionStyleSelect` | — |
| `imageStyles` | `[]` | registry for `AutoImageGenerator` | — |

### Backend-loaded options
`voices`, `clips`, `splits`, `musicOptions`, `health` (all start empty/null), plus `loadError`, and (new) `soundOptions`, `captionStyles`, `imageStyles`, `imageCountBounds`.

### Probe / timeline state
`timelineDuration` (null = timeline locked), `timelineWords` (word timings for the voice strip), `probeId`, `probing` (spinner flag).

### Refs / derived
`uploadSeq` — a monotonic counter so upload keys stay unique across removals (array length would recycle keys after a delete; a ref survives re-renders without triggering them). New: `selectedSplit`/`topFrac` (`useMemo`) — `topFrac = selectedSplit?.top ? selectedSplit.top / 1920 : 1280/1920`, passed to `StickerTimeline` for its live 9:16 preview; `timelineImages` (`useMemo`) — merges `uploads` + `generatedImages` (mapped to `{key,label,url}`) into the single list passed as `StickerTimeline`'s `uploads` prop, so the timeline treats local uploads and AI-generated images identically.

---

## Effects

**Effect #1 — mount load (now 8 calls, was 5):**
```js
Promise.all([getVoices(), getClips(), getSplits(), getMusic(), getHealth(),
             getSounds(), getCaptionStyles(), getImageStyles()])
```
On success, sets each option list *and* its default selection (`music: null → ''`, `musicVolume ← default_volume`, and new: `captionStyle`/`imageStyle`/`imageCount`/`imageCountBounds` ← their respective defaults). ⚠️ `Promise.all` is **still all-or-nothing** — now with more calls, more surface area for one failing endpoint to blank the whole form and show the "backend unreachable" banner (which embeds `VITE_API_BASE`). Fires twice under StrictMode dev.

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
- `handleRemoveUpload(key)` — ⚠️ **new branch:** if `key` starts with `"generated:"`, remove it from `generatedImages` and drop matching placements instead of touching `uploads`/revoking a blob URL (there's no blob to revoke — it's a server URL). Otherwise, the original behavior: revoke the object URL (memory hygiene) and drop any placements referencing it.
- `handleGeneratedImages(images)` (new) — called when an AI image batch finishes. Replaces the batch in `generatedImages`, then rebuilds `placements` by keeping all non-`"generated:"`-prefixed placements and appending one new placement per generated image at the image's own LLM-suggested `start`/`end` (defaults: `x:'center', y:'upper', full_width:false, animation:'none', animation_duration:0.4, sound_id:null`).
- `pickWrapVideo(setter)` / `clearWrapVideo(setter)` (new) — shared factory handlers for the intro/outro video slots; build `{key,name,file,url}`, revoke the prior blob URL on replace/clear.
- `handleGenerate` — the serialization step:
  - strip client-only `id` from each placement (`placements.map(({id, ...rest}) => rest)`),
  - compute `usedKeys` and send **only** uploads actually referenced by a placement (unplaced uploads never leave the browser) — now also pushes `introVideo`/`outroVideo` into the files array if set,
  - force `voiceDescription: isParler ? voiceDescription : ''`,
  - add `captionStyle`, `introVideo: introVideo?.key ?? null`, `outroVideo: outroVideo?.key ?? null` to the payload,
  - call the hook's `start({...now well over a dozen fields...})`.

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
| `getSounds()` (new) | GET /api/sounds | `{sounds:[{id,label,path,description}]}` |
| `soundAudioUrl(soundId)` (new) | (URL builder) | mp3 URL for sound preview |
| `getCaptionStyles()` (new) | GET /api/caption-styles | `{styles, default}` |
| `voiceSampleUrl(voiceId)` (new) | (URL builder) | mp3 URL for voice preview |
| `getImageStyles()` (new) | GET /api/image-styles | `{styles, default, default_count, min_count, max_count}` |
| `generateScenes({...})` (new) | POST /api/scenes/generate (multipart) | `{id}` |
| `getSceneJob(id)` (new) | GET /api/scenes/{id} | `{id, status, stage, done, total, style, error, scenes}` |
| `sceneImageUrl(id, name)` (new) | (URL builder) | PNG URL for a generated scene image |

Note the growing set of **URL-builder** functions (now 5: `probeAudioUrl`, `videoUrl`, `soundAudioUrl`, `voiceSampleUrl`, `sceneImageUrl`) that return raw URLs for media elements, versus the JSON functions that go through `request()`. The **camelCase↔snake_case** translation happens **only here** (`voiceDescription` → `voice_description`, `captionStyle` → `caption_style`, `introVideo`/`outroVideo` → `intro_video`/`outro_video`, etc.).

**`createJob` multipart mechanics (now with more fields + intro/outro video files):**
```js
const form = new FormData()
form.append('payload', JSON.stringify({ text, voice, voice_description, speed, clip,
   background, split, stickers, show_outro, music: music || null, music_volume,
   caption_style, intro_video: introVideo?.key ?? null, outro_video: outroVideo?.key ?? null }))
for (const f of files) form.append('files', f.file, f.key)   // now also carries intro/outro videos
// ⚠️ do NOT set Content-Type — the browser must set the multipart boundary itself
```
Each `stickers[]` entry now also carries `full_width`, `animation`, `animation_duration`, `sound_id`. The **filename-as-foreign-key** trick (`f.key` as the multipart filename, matching each `stickers[].image`) is the crux of the sticker system — see [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md).

**`generateScenes({text, duration, style, count, referenceFile})` (new)** — the same multipart pattern applied to AI image generation: a `payload` JSON part (`{text, duration, style, count}` — note `duration` in **seconds**) plus an optional `reference` file part for the style/subject reference image.

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

## `useSceneImages` — the same pattern, for AI image generation (new)

Mirrors `useGenerationJob`'s submit/poll shape almost exactly, scoped to the optional AI scene-image feature:

- `POLL_MS = 1500` (vs the render job's 1000ms) — "images render on a free Colab GPU, tens of seconds each, so poll a bit slower."
- `start({text, duration, style, count, referenceFile})` → `generateScenes(...)` → phase `running` → recursive `setTimeout` poll of `getSceneJob(id)`.
- `reset()` clears the timer and returns to idle.
- ⚠️ **The same design gaps as `useGenerationJob`, copy-pasted rather than fixed:** no max-attempt cap (a stuck scene job polls forever), and no job-id guard in the poll closure (the same theoretical stale-response race). Consuming component: `AutoImageGenerator.jsx` — see [COMPONENTS.md](COMPONENTS.md).

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

1. **Page load** → 8 parallel GETs populate every dropdown + default (now including sounds/caption-styles/image-styles); missing ffmpeg → amber warning; `health.outro` gates the outro toggle.
2. **Type script** (optionally insert emotion-tag samples via ExpressionGuide). Live word count + `~Xs at Y× speed` estimate; warns over 60s (advisory).
3. **Pick voice** — a ▶ preview button plays a cached sample clip. If Parler, a style-prompt textarea appears. Set speed (1.2 default), clip, background, split, music + volume, caption style, outro (on by default).
4. **Optional: video intro/outro** — upload up to two short clips (≤5s, server-enforced) via `IntroOutroVideo`.
5. **Optional stickers** — upload images, "Load timeline" (POST /api/probe), drag time-range blocks against real narration seconds; each block can now get a slide-in animation, full-width mode, and an attached sound effect. Editing text/voice/speed/description re-locks the timeline.
6. **Optional: AI-generate scene images** — toggle on `AutoImageGenerator`, pick a style/count/optional reference image, click "Generate images"; on completion the results auto-populate timeline blocks exactly like manual stickers, editable the same way.
7. **Generate** (enabled only with text + voice + clip + split) → multipart POST → `{id}` → phase `running` → poll every 1s → `ProgressStages` shows voice/captions/stitch.
8. **Done** → `VideoResult` plays + downloads the mp4; "Generate another" resets. **Error** → error box + "Start over".

⚠️ All state (including uploads and in-progress AI image batches) is **session-only** — a page refresh loses everything.

---

## Consolidated flags

- **Hardcoded:** `localhost:8000` fallback (×2), `POLL_MS=1000` (render) / `1500` (scene images), `BASE_WPM=150`, `MAX_SECONDS=60`, speed default `1.2`, musicVolume `0.18` (×2), background `'black'`, `winget install Gyan.FFmpeg` string in JSX, dark theme in class strings, port 5173, `imageCountBounds`/`imageCount` initial values duplicating backend defaults, `animation_duration` default `0.4` duplicated between `App.jsx` and `StickerTimeline.jsx`.
- **Dead/stale:** `isLikelyTooLong` unused; `useGenerationJob.js` comment says options = `{text,voice,speed,clip}` (now wildly out of date); README component list omits most components.
- **Fragile:** `Promise.all` all-or-nothing boot (now 8 calls); one transient poll failure kills tracking (now true for BOTH pollers); no fetch timeouts; `VITE_API_BASE` baked at build time; probe invalidation on every keystroke while `placements` survive; emotion tags counted as words; reset doesn't cancel server work; the `"generated:"` string prefix is the sole (duplicated, unshared-constant) mechanism distinguishing AI images from uploads; `IntroOutroVideo`'s 5s cap is a label only, not client-enforced.
- **Worth teaching:** filename-as-foreign-key multipart (now also used for intro/outro video); backend-as-source-of-truth for all registries; recursive `setTimeout` polling (now duplicated across two hooks); URL-builders vs JSON `request()`; camel↔snake confined to `client.js`; `isParler` gating from the voice registry's `engine` field; the "merge uploads + generated images into one uniform list" pattern (`timelineImages`) that lets `StickerTimeline` treat both sources identically.

---

## Key takeaways

- Thin client: renders backend-driven dropdowns, submits a multipart job, polls, plays the result. No router/state-lib/axios — and none were added despite substantial new functionality.
- All state lives in `App.jsx` (now well over 18 useState); components are controlled and stateless, including the 3 new ones.
- `client.js` is the only URL-aware module and the sole camelCase↔snake_case boundary — now ~19 functions instead of 10.
- Toolchain load-bearing bits unchanged: Vite port 5173 (CORS), Tailwind v4 CSS-first, `VITE_API_BASE` baked at build.
- Main fragilities, now doubled rather than fixed: two all-or-nothing-adjacent boot patterns, two poll implementations with the same missing job-id guard, session-only state throughout.
