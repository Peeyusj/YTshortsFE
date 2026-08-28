# Frontend Architecture (YTshortsFE)

**What this covers:** the React app that drives the Shorts studio — toolchain, the `App.jsx` state model, the API client, the polling hook, and the end-to-end user flow. **Backend cross-refs:** the API contract is in [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md); the endpoints in [../../YTshortsAnimation/docs/03-BACKEND-API.md](../../YTshortsAnimation/docs/03-BACKEND-API.md).

> This app is a **thin client**. It renders a form from backend data, submits a job, polls until the video appears, and plays it. All real work happens in the backend repo.
>
> **Update:** the app grew substantially alongside the backend's Phase 3/4 work — sticker sound effects/animations/full-width mode, a caption-style picker, video intro/outro upload slots, a live 9:16 preview panel in the timeline, per-voice audio previews, and a whole second, optional "auto-generate scene images" flow with its own submit/poll hook. **Phase 5 update:** an aspect-ratio picker (`CanvasSelect`, 9:16 vs 16:9), a captions on/off toggle (`CaptionsToggle`), Ken Burns zoom/pan controls added to the sticker editor, and a preview button on `MusicSelect`.
>
> **Latest ("multi-image-provider") update:** the biggest single jump in surface area since the app's inception — 7 new components, roughly 20 new `useState` calls, and ~11 new `client.js` functions across 7 commits. New: a **character-library** UI (create/select a reusable AI-image reference) and an **image-provider picker**; a **"recent projects"** panel to reopen a past finished render (with a `StickerTimeline` prop rename, `probeId`→`audioSrc`, as a side effect); a caption **vertical-position** picker and a **word-highlight ("karaoke") animation + density** control; a scene-image **transition + Ken Burns strength** picker; an **outro-card** picker (replacing the old single on/off toggle); an **image-count suggestion** helper; and a from-scratch **live style preview** component (`StylePreview.jsx`) that mocks up captions and image transitions before you render anything. This revision covers all of it.

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
├── App.jsx                     THE state owner — 50+ useState now, effects, handlers
├── api/client.js               The ONLY module that knows backend URLs & shapes (30+ functions)
├── hooks/
│   ├── useGenerationJob.js      submit + poll state machine (render jobs)
│   └── useSceneImages.js        the same pattern, for AI image-generation jobs
├── lib/
│   ├── estimate.js             word-count → seconds estimate
│   └── ass.js                  NEW — assColorToCss() + captionColors(), extracted from
│                                 CaptionStyleSelect so it and StylePreview can't disagree
└── components/                 25 components: the original 12 + AutoImageGenerator/
                                 CaptionStyleSelect/IntroOutroVideo/CanvasSelect/CaptionsToggle
                                 (earlier passes) + 7 new this pass: CharacterLibrary,
                                 CharacterSelect, CaptionPositionSelect, CaptionAnimationSelect,
                                 ImageMotionSelect, RecentProjects, StylePreview
```

No router, no state library (Redux/Zustand), no fetch wrapper (axios), no UI kit. Everything is hand-rolled: raw `fetch`, `useState`, and prop drilling from `App.jsx` to its children. No new npm dependencies were added for any of this — it's all built on the existing primitives.

---

## `App.jsx` — the complete state model

One component owns everything (no context, no reducer). 50+ `useState` calls now, plus refs and two custom hooks.

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
| `placements` | `[]` | `stickers` | client `id` stripped before sending; entries now also carry `full_width`/`animation` (8 values: 4 slide-in + 4 Ken Burns)/`animation_duration`/`sound_id`/`image_fit` (new — `cover`\|`contain`) |
| `uploads` | `[]` | (files) | session-only `{key,label,file,url}` |
| `showOutro` | `true` | `show_outro` | frontend-owned (the static-image outro card, unchanged) |

### Form state (Phase 3/4/5)

| State | Initial | Purpose | Wire field |
|---|---|---|---|
| `captionStyle` | `''` | selected caption preset id | `caption_style` |
| `autoImageOn` | **`true`** (was `false` — flipped this pass) | AI-image panel toggle | — (UI-only) |
| `imageStyle` | `''` | selected AI image style id | sent to `generateScenes`, not `/api/generate` |
| `imageCount` | `5` | # of AI images to generate | sent to `generateScenes` |
| `imageCountBounds` | `{min:1,max:100}` | clamp for the count input, seeded from `getImageStyles()` | — |
| `generatedImages` | `[]` | finished AI images `{key,label,url,start,end}` | feeds `placements`, not sent directly |
| `introVideo` | `null` | `{key,name,file,url}` intro clip | `intro_video` (key) + `files` |
| `outroVideo` | `null` | `{key,name,file,url}` outro clip | `outro_video` (key) + `files` |
| `canvas` | `''` | selected aspect ratio (`vertical`\|`landscape`) | `canvas` |
| `captionsEnabled` | `true` | burn-in captions on/off | `captions_enabled` |
| `soundOptions` | `[]` | sound-effect registry for the sticker dropdown | — |
| `captionStyles` | `[]` | registry for `CaptionStyleSelect` | — |
| `imageStyles` | `[]` | registry for `AutoImageGenerator` | — |

### Form state — newest pass (characters, providers, captions/motion, outro, seed, recent projects)

| State | Initial | Purpose | Wire field |
|---|---|---|---|
| `characters` | `[]` | saved character list, loaded via a **standalone** `refreshCharacters` effect (not the mount `Promise.all`) so it can be re-fetched after create/delete | — |
| `imageCharacterId` | `''` | selected saved character (`''` = none — an ad-hoc reference upload is used instead) | `character_id` (via `generateScenes`) |
| `imageProviders` | `[]` | image-provider registry from `getImageProviders()` | — |
| `imageProvider` | `''` | selected provider id (`''` = server default) | `image_provider` (via `generateScenes`) |
| `captionPosition` | `''` | selected caption vertical-position id | `caption_position` |
| `captionPositions` | `[]` | registry for `CaptionPositionSelect` | — |
| `captionAnimation` | `'pop'` | word-highlight mode | `caption_animation` |
| `captionHighlight` | `'amber'` | word-highlight colour | `caption_highlight` |
| `captionDensity` | `'compact'` | words per caption line | `caption_density` |
| `captionAnimations`, `captionHighlights`, `captionDensities` | `[]` each | registries for `CaptionAnimationSelect`, from `getCaptionAnimations()` | — |
| `imageTransition` | `'crossfade'` | scene-image handover style | `image_transition` |
| `transitionSeconds` | `0.45` | handover length | `transition_seconds` |
| `kenBurns` | `'medium'` | Ken Burns zoom strength | `ken_burns` |
| `imageTransitions`, `kenBurnsLevels`, `transitionBounds` | — | registries/bounds for `ImageMotionSelect`, from `getMotionOptions()` | — |
| `outro` | `''` | selected outro-card id | `outro` (null if unset) |
| `outroSeconds` | `2` | outro hold duration | `outro_seconds` |
| `outroCards`, `outroDefaults`, `outroSecondsChoices` | — | registries for `OutroToggle`'s card grid, from `getOutros()` | — |
| `seed` | `null` | the gameplay-trim seed a restored project was rendered with; `null` on a fresh job (backend derives one) | `seed` |
| `restoredImages` | `[]` | images reused from a reopened past job, `{key,label,url}` (`key` = `"job:<oldJobId>/<filename>"`) | feeds `placements`/uploads, not sent directly |
| `restoredAudioUrl` | `null` | a reopened past job's narration mp3 URL | drives `audioSrc` when no live `probeId` exists |
| `generatedAspect` | `null` | `{canvas, split}` the currently-generated AI images were baked for, captured in `handleGeneratedImages` — used to warn when `canvas`/`split` changes afterward | — |

### Backend-loaded options
`voices`, `clips`, `splits`, `musicOptions`, `health` (all start empty/null), plus `loadError`, `soundOptions`, `captionStyles`, `imageStyles`, `imageCountBounds`, and the newest-pass registries listed above (`imageProviders`, `captionPositions`, `captionAnimations`/`Highlights`/`Densities`, `imageTransitions`/`kenBurnsLevels`, `outroCards`/`Defaults`/`SecondsChoices`) — roughly **14 calls** now feed the mount `Promise.all` (`characters` is the one exception, loaded separately — see below).

### Probe / timeline state
`timelineDuration` (null = timeline locked), `timelineWords` (word timings for the voice strip), `probeId`, `probing` (spinner flag).

### Refs / derived
`uploadSeq` — a monotonic counter so upload keys stay unique across removals (array length would recycle keys after a delete; a ref survives re-renders without triggering them). `selectedSplit`/`topFrac` (`useMemo`) — `topFrac = selectedSplit?.top ? selectedSplit.top / 1920 : 1280/1920`, passed to `StickerTimeline` for its live 9:16 preview; `timelineImages` (`useMemo`) — merges `uploads` + `generatedImages` (+ **new:** `restoredImages`) into the single list passed as `StickerTimeline`'s `uploads` prop, so the timeline treats local uploads, AI-generated images, and images reused from a reopened project identically. **New refs:** `restoringRef`/`skipDurationResetRef` — make the probe-invalidation effects (below) skip exactly one cycle right after `handleLoadProject` runs, so they don't immediately wipe the state a reopened project just populated. **New `useMemo` values** feeding `StylePreview`: `selectedCaptionStyle`, `selectedHighlightCss`, `selectedDensity`, `selectedKenBurnsZoom`, `selectedCaptionYFraction`, `previewTopFraction` (canvas-aware: returns `1` for landscape, mirroring `CanvasSelect`'s duplicated full-screen rule).

---

## Effects

**Effect #1 — mount load (now roughly 14 calls, up from 9):**
```js
Promise.all([getVoices(), getClips(), getSplits(), getMusic(), getHealth(),
             getSounds(), getCaptionStyles(), getImageStyles(), getCanvases(),
             getCaptionPositions(), getCaptionAnimations(), getMotionOptions(),
             getImageProviders(), getOutros()])
```
On success, sets each option list *and* its default selection (`music: null → ''`, `musicVolume ← default_volume`, `captionStyle`/`imageStyle`/`imageCount`/`imageCountBounds` ← their respective defaults, `canvas ← default`, and the newest defaults: `captionPosition`, `captionAnimation`/`Highlight`/`Density`, `imageTransition`/`transitionSeconds`/`kenBurns`, `outro`/`outroSeconds`). ⚠️ `Promise.all` is **still all-or-nothing**, now with even more surface area for one failing endpoint to blank the whole form. ⚠️ **New fragility:** the destructured callback parameter list is now roughly 14 long and purely positional (matching array order, not named) — reordering the `Promise.all` array without reordering the destructure is a silent, easy-to-introduce bug. Fires twice under StrictMode dev.

**Effect #1b — character library load (new, standalone, NOT part of the mount `Promise.all`):** `refreshCharacters` is its own `useCallback`/`useEffect` pair, deliberately separated so `CharacterLibrary` can call it again after a create/delete without re-running the whole boot sequence.

**Effect #2 — probe invalidation:** deps `[text, voice, speed, voiceDescription]`. Any change nulls `timelineDuration`/`timelineWords`/`probeId`, re-locking the sticker timeline — because a probe's measured duration is only valid for the exact inputs it measured (`voiceDescription` is included because for Parler a different prompt = different audio = different duration). ⚠️ It fires on **every keystroke** in the script box, and it does **NOT** clear `placements` — so old sticker blocks can outlive the timeline they were drawn against. **New:** guarded by `restoringRef`/`skipDurationResetRef` so it skips exactly one cycle immediately after `handleLoadProject` runs — otherwise a reopened project's just-restored timeline state would be wiped on the very next render.

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
- `handleGeneratedImages(images)` — called when an AI image batch finishes. Replaces the batch in `generatedImages`, records `generatedAspect = {canvas, split}` (new — the shape the batch was baked for), then rebuilds `placements` by keeping all non-`"generated:"`-prefixed placements and appending one new placement per generated image at the image's own suggested `start`/`end`. **New:** each auto-placed image's `animation` now cycles through `KB_CYCLE = ['zoom-in','pan-in','zoom-out','pan-out']` by index (mirroring the backend's `KEN_BURNS_CYCLE`) instead of always defaulting to `'zoom-in'`, and the default `sound_id` changed from `null` to `'whoosh_soft'`.
- `pickWrapVideo(setter)` / `clearWrapVideo(setter)` — shared factory handlers for the intro/outro video slots; build `{key,name,file,url}`, revoke the prior blob URL on replace/clear.
- `handleLoadProject(id)` (new) — the "reopen a past render" handler. `Promise.all([getJobProject(id), getJobTimestamps(id)])`, then repopulates essentially every form field (text/voice/voiceDescription/speed/clip/background/split/canvas/music/musicVolume/captionStyle/captionsEnabled/showOutro/captionPosition/captionAnimation/Highlight/Density/imageTransition/transitionSeconds/kenBurns/outro/outroSeconds/seed), sets `timelineDuration`/`timelineWords` **directly from the past job's real measured timestamps — no fresh `/api/probe` call**, and rebuilds `placements`/`restoredImages`/`introVideo`/`outroVideo` from the resolved past-job sticker list. Sets `restoringRef`/`skipDurationResetRef` so the probe-invalidation effects don't immediately undo the restore.
- `handleGenerate` — the serialization step:
  - strip client-only `id` from each placement (`placements.map(({id, ...rest}) => rest)`),
  - compute `usedKeys` and send **only** uploads actually referenced by a placement (unplaced uploads never leave the browser) — pushes `introVideo`/`outroVideo` into the files array **only if they carry a `.file`** (new guard — a restored intro/outro reused from a past job via a `"job:<id>/<file>"` key has no `.file` to re-upload),
  - force `voiceDescription: isParler ? voiceDescription : ''`,
  - add every field listed in the state tables above to the payload — `captionStyle`, `introVideo`/`outroVideo` keys, `canvas`, `captionsEnabled`, and (newest) `captionPosition`, `captionAnimation`/`Highlight`/`Density`, `imageTransition`/`transitionSeconds`/`kenBurns`, `outro`/`outroSeconds`, `seed`,
  - call the hook's `start({...30+ fields now...})`.
- `handleRemoveUpload` — gained a third branch (alongside the existing `"generated:"` handling) for `"job:"`-prefixed keys (a restored sticker/intro/outro from a reopened project), on top of the original plain-upload behavior.

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
| `getSounds()` | GET /api/sounds | `{sounds:[{id,label,path,description}]}` |
| `soundAudioUrl(soundId)` | (URL builder) | mp3 URL for sound preview |
| `getCaptionStyles()` | GET /api/caption-styles | `{styles, default}` |
| `voiceSampleUrl(voiceId)` | (URL builder) | mp3 URL for voice preview |
| `getImageStyles()` | GET /api/image-styles | `{styles, default, default_count, min_count, max_count}` |
| `generateScenes({...})` | POST /api/scenes/generate (multipart) | `{id}` |
| `getSceneJob(id)` | GET /api/scenes/{id} | `{id, status, stage, done, total, style, error, scenes}` |
| `sceneImageUrl(id, name)` | (URL builder) | PNG URL for a generated scene image |
| `musicAudioUrl(musicId)` | (URL builder) | mp3 URL for music preview |
| `getCanvases()` | GET /api/canvases | `{canvases, default}` |
| `getCharacters()` (new) | GET /api/characters | `{characters:[{id,name,description,style,seed,source,image_url,created_at}]}` |
| `createCharacter({...})` (new) | POST /api/characters (multipart) | `CharacterOut` |
| `deleteCharacter(id)` (new) | DELETE /api/characters/{id} | — |
| `characterImageUrl(id)` (new) | (URL builder) | PNG URL for a character's reference image |
| `getImageProviders()` (new) | GET /api/image-providers | `{providers:[...], default}` |
| `suggestImageCount({text, duration})` (new) | POST /api/scenes/suggest-count (JSON) | `{count, min_count, max_count}` |
| `getCaptionPositions()` (new) | GET /api/caption-positions | `{positions, default}` |
| `getCaptionAnimations()` (new) | GET /api/caption-animations | `{animations, default, highlights, default_highlight, densities, default_density}` |
| `getMotionOptions()` (new) | GET /api/motion | `{transitions, default_transition, default_seconds, min_seconds, max_seconds, ken_burns, default_ken_burns}` |
| `getOutros()` (new) | GET /api/outros | `{outros, defaults, seconds_choices, default_seconds, min_seconds, max_seconds}` |
| `outroImageUrl(id)` (new) | (URL builder) | PNG URL for an outro card's thumbnail |
| `getRecentJobs()` (new) | GET /api/jobs | recent finished-render list |
| `getJobProject(id)` (new) | GET /api/jobs/{id}/project | a past job's full settings |
| `getJobTimestamps(id)` (new) | GET /api/jobs/{id}/timestamps | `{duration, words}` |
| `jobAudioUrl(id)` (new) | (URL builder) | mp3 URL for a past job's narration |
| `jobStickerUrl(id, name)` (new) | (URL builder) | image URL for a past job's sticker |

Note the growing set of **URL-builder** functions (now 11: `probeAudioUrl`, `videoUrl`, `soundAudioUrl`, `voiceSampleUrl`, `sceneImageUrl`, `musicAudioUrl`, `characterImageUrl`, `outroImageUrl`, `jobAudioUrl`, `jobStickerUrl`, plus `probeAudioUrl` again for the restored-project fallback) that return raw URLs for media elements, versus the JSON functions that go through `request()`. The **camelCase↔snake_case** translation happens **only here** (`voiceDescription` → `voice_description`, `captionStyle` → `caption_style`, `introVideo`/`outroVideo` → `intro_video`/`outro_video`, `captionsEnabled` → `captions_enabled`, `captionPosition`/`captionAnimation`/`captionHighlight`/`captionDensity`, `imageTransition`/`transitionSeconds`/`kenBurns`, `characterId`/`imageProvider`, etc.).

**`createJob` multipart mechanics (now with 15+ payload fields + intro/outro video files):**
```js
const form = new FormData()
form.append('payload', JSON.stringify({ text, voice, voice_description, speed, clip,
   background, split, canvas, stickers, show_outro, music: music || null, music_volume,
   caption_style, captions_enabled, intro_video: introVideo?.key ?? null,
   outro_video: outroVideo?.key ?? null, caption_position, caption_animation,
   caption_highlight, caption_density, image_transition, transition_seconds,
   ken_burns, outro: outro || null, outro_seconds, seed }))
for (const f of files) form.append('files', f.file, f.key)   // also carries intro/outro videos
// ⚠️ do NOT set Content-Type — the browser must set the multipart boundary itself
```
Each `stickers[]` entry also carries `full_width`, `animation`, `animation_duration`, `sound_id`, `image_fit`. The **filename-as-foreign-key** trick (`f.key` as the multipart filename, matching each `stickers[].image`) is the crux of the sticker system — see [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md).

**`generateScenes({text, duration, style, count, referenceFile, characterId, imageProvider})`** — the same multipart pattern applied to AI image generation: a `payload` JSON part (`{text, duration, style, count, character_id, image_provider}` — note `duration` in **seconds**) plus an optional `reference` file part for the style/subject reference image. An ad-hoc `referenceFile` wins over `characterId` if both are somehow set — the UI hides the upload field once a character is picked, so this is a belt-and-braces rule, not a normal path.

---

## ⚠️ A breaking-ish prop change: `StickerTimeline`'s `probeId` → `audioSrc`

`StickerTimeline` no longer takes a `probeId` prop — it takes a plain resolved URL string, `audioSrc`. `App.jsx` now computes it: `audioSrc = probeId ? probeAudioUrl(probeId) : restoredAudioUrl`, so the same prop serves both a live probe (`/api/probe/{id}/audio`) and a reopened project's narration (`/api/jobs/{id}/audio`), and `StickerTimeline` itself no longer needs to know which source it's playing. Any earlier doc revision, comment, or mental model that references `StickerTimeline`'s `probeId` prop is stale — see [STICKER-TIMELINE.md](STICKER-TIMELINE.md).

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

1. **Page load** → ~14 parallel GETs populate every dropdown + default; the character library loads separately; missing ffmpeg → amber warning; `health.outro` gates the outro toggle.
2. **Type script** (optionally insert emotion-tag samples via ExpressionGuide). Live word count + `~Xs at Y× speed` estimate; warns over 60s (advisory).
3. **Pick voice** — a ▶ preview button plays a cached sample clip. If Parler, a style-prompt textarea appears. Set speed (1.2 default), clip, background, split/canvas, music + volume, caption style/position/animation/density, outro card + duration.
4. **Optional: video intro/outro** — upload up to two short clips (≤5s, server-enforced) via `IntroOutroVideo`.
5. **Optional stickers** — upload images, "Load timeline" (POST /api/probe), drag time-range blocks against real narration seconds; each block can get a slide-in animation, full-width mode, Ken Burns motion, and an attached sound effect. Editing text/voice/speed/description re-locks the timeline.
6. **Optional: AI-generate scene images** (on by default now) — pick a style/count (or "Suggest count from script"), optionally a saved character or ad-hoc reference image, an image provider, click "Generate images"; on completion the results auto-populate timeline blocks exactly like manual stickers, editable the same way, each cycling through a different Ken Burns effect.
7. **Optional: reopen a past render** — `RecentProjects` lists recent finished jobs; picking one rehydrates the entire form (including the timeline, from the real measured timestamps, no re-probe) without starting a new render.
8. **Preview before rendering** — `StylePreview` mocks up how the chosen caption style/animation and image transition/Ken Burns settings will actually look, using real probe/generated-image data when available.
9. **Generate** (enabled only with text + voice + clip + split) → multipart POST → `{id}` → phase `running` → poll every 1s → `ProgressStages` shows voice/captions/stitch.
10. **Done** → `VideoResult` plays + downloads the mp4; "Generate another" resets. **Error** → error box + "Start over".

⚠️ All state (including uploads and in-progress AI image batches) is **session-only** — a page refresh loses everything, **except** whatever's durable on the backend and reachable via "reopen a past render" (item 7).

---

## Consolidated flags

- **Hardcoded:** `localhost:8000` fallback (×2), `POLL_MS=1000` (render) / `1500` (scene images), `BASE_WPM=150`, `MAX_SECONDS=60`, speed default `1.2`, musicVolume `0.18` (×2), background `'black'`, `winget install Gyan.FFmpeg` string in JSX, dark theme in class strings, port 5173, `imageCountBounds`/`imageCount` initial values duplicating backend defaults, `animation_duration` default `0.4` duplicated between `App.jsx` and `StickerTimeline.jsx`, `KB_CYCLE` in `App.jsx` mirroring the backend's `KEN_BURNS_CYCLE` with no shared constant.
- **Dead/stale:** `isLikelyTooLong` unused; `useGenerationJob.js` comment says options = `{text,voice,speed,clip}` (now wildly out of date); README component list omits most components.
- **Fragile:** `Promise.all` all-or-nothing boot (now ~14 calls, purely positional destructure); one transient poll failure kills tracking (true for both pollers); no fetch timeouts; `VITE_API_BASE` baked at build time; probe invalidation on every keystroke while `placements` survive; emotion tags counted as words; reset doesn't cancel server work; the `"generated:"`/`"job:"` string prefixes are the sole (duplicated, unshared-constant) mechanism distinguishing image sources; `IntroOutroVideo`'s 5s cap is a label only, not client-enforced.
- **Two commit messages this pass undersold their own diffs** (worth knowing if you go spelunking in git history): "added tentative image number prediction" was mostly a separate, unmentioned "recent projects" feature; "fixed image height" was actually a new stale-aspect-ratio warning banner, not a layout bug fix.
- **Worth teaching:** filename-as-foreign-key multipart (now also used for intro/outro video AND reopened-project stickers, via `"job:<id>/<file>"`); backend-as-source-of-truth for all registries; recursive `setTimeout` polling (duplicated across two hooks); URL-builders vs JSON `request()`; camel↔snake confined to `client.js`; `isParler` gating from the voice registry's `engine` field; the "merge uploads + generated + restored images into one uniform list" pattern (`timelineImages`); a single resolved `audioSrc` string now standing in for "wherever this narration audio actually lives" (live probe or a reopened past job).

---

## Key takeaways

- Thin client: renders backend-driven dropdowns, submits a multipart job, polls, plays the result. No router/state-lib/axios — and none were added despite a near-doubling of the app's surface area this pass.
- All state lives in `App.jsx` (50+ useState now); components are controlled and stateless, including all 7 new ones.
- `client.js` is the only URL-aware module and the sole camelCase↔snake_case boundary — 30+ functions now, up from ~19.
- Toolchain load-bearing bits unchanged: Vite port 5173 (CORS), Tailwind v4 CSS-first, `VITE_API_BASE` baked at build.
- This pass's biggest structural additions: a character library with its own out-of-band load effect, a "recent projects" reopen flow that forced a real prop-shape change (`probeId`→`audioSrc`), and a from-scratch live style-preview component that reimplements (as an approximation) several backend rendering formulas in JS/CSS so users can see roughly what they'll get before spending a render.
- Main fragilities, mostly doubled rather than fixed: an even larger all-or-nothing boot Promise, two poll implementations with the same missing job-id guard, session-only state throughout (with one genuine exception now — reopening a past render).
