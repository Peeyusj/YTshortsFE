# Component Reference (YTshortsFE)

**What this covers:** all 24 of the simpler components in `src/components/` (11 original + `VoiceSelect`'s preview feature + 3 Phase-3/4 additions + 2 Phase-5 additions + 7 new this pass). The big `StickerTimeline` has its own doc: [STICKER-TIMELINE.md](STICKER-TIMELINE.md). **Read first:** [FRONTEND.md](FRONTEND.md) for the `App.jsx` state model these bind to.

---

## Shared patterns (mostly still true — several components now break rule 1)

1. **Stateless & fully controlled, with a few exceptions.** The original components contain no `useState`/`useEffect`/`useRef`. **`VoiceSelect`**, **`IntroOutroVideo`**, **`MusicSelect`**, and (new) **`CharacterLibrary`**, **`RecentProjects`**, **`StylePreview`** now have local state (preview-playback status, an `Audio()` ref, a create/delete form, a modal's open/loading state, or — `StylePreview` — a full `requestAnimationFrame` animation loop) — still receive their real data via props, just manage UI-only interaction or presentation locally rather than lifting it to `App.jsx`. Everything else remains fully controlled.
2. **`disabled` is always `isBusy`** — the whole form freezes during a render.
3. **Backend-driven options.** No component hardcodes voice/clip/split/music/sound/caption-style/image-style/canvas/provider/outro-card ids — they arrive as props from `App.jsx`'s mount `Promise.all` (now roughly 14 calls) or, for `characters`, a standalone load effect. (The one exception: `BackgroundToggle`, whose two options are a fixed frontend list.)
4. **Dark Tailwind theme** — slate-950 bg, slate-100 text, indigo accent, emerald=success, rose=error, amber=warning. All new components follow the same theme.
5. **Zero orphans.** All 24 (of the "simple" set) are imported and rendered in `App.jsx`.

---

## Reference

### ScriptInput
- **Props:** `value` (text), `onChange`, `speed` (for the estimate), `disabled`.
- **Renders:** an 8-row `<textarea>` (placeholder "Paste or type your Hinglish story here…" — the product is explicitly Hinglish-first), a live "{chars} chars · {words} words" readout, and a `~{seconds}s estimated at {speed}× speed` footer that turns amber with a warning past `MAX_SECONDS` (60).
- **Notes:** advisory only — **no maxLength, nothing blocks an over-60s script**. ⚠️ `countWords` counts emotion tags as words (overestimate). ⚠️ Displays speed as `.toFixed(2)` ("1.20×") while SpeedSlider uses `.toFixed(1)` ("1.2×") — minor inconsistency.

### ExpressionGuide
- **Props:** `onInsertSample(sampleString)`, `disabled`. No `value`.
- **Renders:** a collapsed `<details>` documenting the emotion-tag feature, with a hardcoded `TAGS` table (`[excited]`→"Faster + higher pitch", `[sad]`→"Slower + lower", `[calm]`→"Normal") and an "Insert example script" button that emits a Hinglish demo exercising all three tags.
- **App wiring:** `onInsertSample` appends the sample with a newline if the textarea has content, else replaces.
- ⚠️ The tag semantics live here *and* in the backend TTS logic — no shared source of truth, so this table silently lies if the backend changes.

### VoiceSelect (extended — now has a preview button)
- **Props:** `voices`, `value`, `onChange`, `disabled`.
- **Renders:** a `<select>` of `<option value={v.id}>{v.label}</option>`, disabled when `disabled || voices.length === 0`, plus (new) a **▶ preview button** beside it.
- **New local state:** `previewState` (`'idle'|'loading'|'error'`) — the one piece of genuine local state on this component. `playPreview()` lazily creates one reusable `Audio()` element, points its `src` at `voiceSampleUrl(value)` (`GET /api/voices/{id}/sample`), sets `previewState('loading')`, and plays; `oncanplay` → `'idle'`, `onerror`/a rejected `.play()` → `'error'` (renders "Couldn't play a preview for this voice." below the button). The button label itself shows `…` while loading.
- **Notes:** the voice objects carry more than this uses — `App.jsx` reads `.engine` (for `isParler`) and `.default_description` (Parler placeholder) elsewhere. Default comes from the API (`setVoice(voiceData.default)`), no frontend-hardcoded voice id. The preview's first click per voice pays a real backend synthesis cost (cached after); later clicks for that voice are fast. See [../../YTshortsAnimation/docs/05-VOICE-ENGINES.md](../../YTshortsAnimation/docs/05-VOICE-ENGINES.md) §4.

### VoiceDescriptionInput
- **Props:** `value` (voiceDescription), `onChange`, `placeholder`, `disabled`.
- **Renders:** a 3-row textarea with an "AI voice" badge. **Conditionally rendered — only when `isParler`.** Placeholder falls back to the voice's `default_description`; an empty box is a valid "use the default" state.
- **Notes:** `App.jsx` sends `voice_description: isParler ? value : ''` on generate, but doesn't *clear* the state on voice switch — so Parler→edge→Parler restores the previously typed prompt. Changing it invalidates the probe timeline.

### SpeedSlider
- **Props:** `value` (float), `onChange`, `disabled`.
- **Renders:** `<input type="range" min={1} max={2} step={0.1}>`, shown as `{value.toFixed(1)}×`, labels "1.0× normal" / "2.0× fast".
- **Notes:** emits `parseFloat`. The raw multiplier is sent; the backend converts it to edge-tts's `+N%`. Default `1.2` (frontend-owned). ⚠️ For Parler voices the slider does nothing (Parler ignores rate) yet still invalidates the probe and busts the voice cache — see [../../YTshortsAnimation/docs/05-VOICE-ENGINES.md](../../YTshortsAnimation/docs/05-VOICE-ENGINES.md).

### ClipSelect
- **Props:** `clips`, `value`, `onChange`, `disabled`. Labeled "Bottom video".
- **Renders:** a `<select>`; disabled when empty. Structurally identical to VoiceSelect.
- **Notes:** new clips are "purely a backend config change". Required by `canGenerate`.

### BackgroundToggle
- **Props:** `value` (`'black'|'white'`), `onChange`, `disabled`. "Feature #2".
- **Renders:** the **only** component with a frontend-hardcoded option list — a 2-button segmented control (black/white), each showing an "Aa" swatch previewing the resulting caption text colour (captions auto-pick a contrasting colour server-side). Selected button gets an indigo ring.
- **Notes:** default `'black'` (frontend-owned). Controls the top-region background, sent as `background`.

### SplitSelect
- **Props:** `splits` (each `{id, label, top, bottom}` pixel heights), `value`, `onChange`, `disabled`. "Feature #5".
- **Renders:** a `<select>` + a tiny two-tone proportion preview bar (top slate = captions, bottom indigo = clip).
- ⚠️ **Magic number:** `topPct = active ? (active.top / 1920) * 100 : 66.7` — hardcodes **1920** as the total canvas height (duplicated from the backend), which is now **wrong for a landscape (1920×1080) canvas** — the preview bar's proportions would be nonsensical for the `"full"` split or a landscape render. Fallback `66.7` used before options load.
- Gained a 5th option in Phase 5: `"full"` (no gameplay clip — top=1920, bottom=0). `App.jsx` disables this component's parent `ClipSelect` when `split === 'full'` (see `CanvasSelect` below).

### CanvasSelect (new, Phase 5)
- **Props:** `canvases` (`{id,label,width,height}`), `value`, `onChange`, `disabled`.
- **Renders:** a plain `<select id="canvas">` labeled "Aspect ratio" — structurally identical to `ClipSelect`/`VoiceSelect`.
- **Wiring:** `App.jsx` disables `ClipSelect` and `SplitSelect` (with an explanatory note) whenever `canvas === 'landscape'`, mirroring the backend's `resolve_canvas_split()` rule that landscape always renders full-screen (no gameplay clip, split ignored). ⚠️ **This rule is duplicated, not derived** — the frontend has its own copy of the same "landscape → always full-screen" logic; if the backend rule ever changes, this check must be updated by hand too. See [../../YTshortsAnimation/docs/06-CONFIG-REGISTRIES.md](../../YTshortsAnimation/docs/06-CONFIG-REGISTRIES.md).
- ⚠️ Unlike `voice`/`clip`/`split`, `App.jsx`'s `canGenerate` check does **not** require `canvas` to be truthy — harmless in practice (the bootstrap effect always sets a default and the dropdown can't produce an empty value) but an inconsistency with the sibling fields.

### CaptionsToggle (new, Phase 5)
- **Props:** `value` (bool), `onChange`, `disabled`.
- **Renders:** a single checkbox, "Burn in subtitles."
- **Server-side effect:** unlike a purely cosmetic toggle, turning this off makes the backend skip the **entire** captions-generation stage (not just the burn-in step) — a real compute saving, not just a rendering shortcut. See [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §3.
- **Wiring:** when off, `App.jsx` also disables `CaptionStyleSelect` (`disabled={isBusy || !captionsEnabled}`) — no point picking a style for captions that won't render.

### MusicSelect (extended in Phase 5 — now has a preview button)
- **Props:** `music` (`{id,label,path,artist,mood,description}`), `value`, `onChange`, `volume`, `onVolumeChange`, `disabled`. The richest option component.
- **Renders four parts now:** (1) a `<select>` with a hardcoded first option "None — narration only" (⚠️ **not** disabled when the list is empty, unlike the others, because "None" is always valid) **plus** (new) a ▶/■ preview button beside it; (2) a metadata panel (artist/mood pill/description) shown **only when a track is selected**; (3) a volume slider shown only when a track is selected.
- **New local state (breaks the "fully controlled" pattern, like `VoiceSelect`):** `audioRef` (a lazily-created `Audio()` element, reused) and `isPlaying`. `togglePreview()` sets `.src = musicAudioUrl(value)` and plays/pauses — same pattern as `VoiceSelect`'s sample button and `StickerTimeline`'s sound-effect preview (three independent copies of the same ~15 lines, no shared hook — see [STICKER-TIMELINE.md](STICKER-TIMELINE.md)). Two effects stop playback when `value` changes (so switching tracks, or picking "None," can't leave a stale preview playing) and on unmount.
- ⚠️ **Unit conversion:** state is a 0..1 float ("matches the backend"), but the slider works in integer percent — displays `Math.round(volume*100)`, emits `parseInt(...)/100`. Labels "Subtle" / "As loud as voice".
- **Notes:** defaults from the API (`music: null → ''`, `default_volume`). The `0.18` fallback also appears as the `App.jsx` initial state (duplicated). On generate, `music: music || null`. The registry gained 2 tracks in Phase 5 (5 total) — no component changes were needed for that part, since the dropdown already maps over whatever the backend returns.

### OutroToggle (rewritten this pass — a full card picker, not just on/off)
- **Props:** `value` (bool), `onChange`, `disabled`, `available` (**tri-state**: true/false/undefined), plus new: `outros` (array), `canvas`, `outro` (selected card id), `onOutroChange`, `seconds`, `onSecondsChange`, `secondsChoices`.
- **Renders:** the original "Show outro card" checkbox, **plus** (when on) a 3-column thumbnail grid of `outros` filtered to `c.canvas === canvas || c.canvas === 'any'` (so 9:16 cards never show for a landscape render and vice versa — mirroring the backend's `OUTRO_CARDS` canvas-tagging), each thumbnail from `outroImageUrl(c.id)`, plus a row of duration quick-pick buttons from `secondsChoices` (e.g. `2/3/5`).
- ⚠️ **Tri-state handling (unchanged):** the warning "No assets/outroImage.png on the backend" shows only on strict `available === false`; when health hasn't loaded (`undefined`) no warning shows. `available` comes from `health?.outro`. Default `true` (frontend-owned), sent as `show_outro`.
- **Wiring:** `App.jsx` has a new effect watching `[canvas, outro, outroCards, outroDefaults]` — if the currently-selected card no longer fits the current canvas (e.g. you switch from vertical to landscape), it falls back to that canvas's default card or the first matching one, but explicitly leaves a still-fitting selection alone (including one just restored from a reopened project).
- **Not the same feature as `IntroOutroVideo` below** — this is the static-*image* outro card, now a real registry of several cards; the newer component is video-based and fully independent (both can be active at once).

### CaptionStyleSelect (new)
- **Props:** `styles`, `value`, `onChange`, `background`, `disabled`.
- **Renders:** a `<select id="caption-style">` populated from `styles` (`{id,label}`), plus a live preview panel showing `selected.description` and a styled text sample using `assColorToCss(selected.primary)`/`assColorToCss(selected.outline)` — a small local helper that reverses the backend's `.ass` `&HAABBGGRR` hex format into a CSS `#RRGGBB` string (see [../../YTshortsAnimation/docs/02-CONCEPTS.md](../../YTshortsAnimation/docs/02-CONCEPTS.md) §5 for the color-format explanation). When a style leaves `primary`/`outline` unset (the default `classic_bold` preset), the preview falls back to the `background` prop's implied contrast (`background==='white' ? black text : white text`), mirroring the backend's own auto-contrast fallback logic. The preview uses `WebkitTextStroke` to approximate an outline.
- **Wiring:** `value`/`onChange` bind to App's `captionStyle` state, sent as `caption_style` on generate. A thin, stateless picker — same shape as `MusicSelect`.

### IntroOutroVideo (new)
- **Props:** `intro`, `outro` (each `{key,name,file,url}|null`), `onPickIntro`, `onPickOutro`, `onClearIntro`, `onClearOutro`, `disabled`.
- **Renders:** two side-by-side "Slot" panels (Intro / Outro), each either a `<video controls muted>` preview + filename + Remove button (when set) or a dashed dropzone `<input type="file" accept="video/*">` (when empty). A `MAX_SECONDS = 5` label ("≤ 5s · full screen") is shown but is **advisory only** — ⚠️ the component never reads the picked file's actual duration; enforcement happens entirely server-side (a longer clip is silently truncated at render time — see [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4.8).
- **Not the same feature as `OutroToggle`** — this is a genuinely separate mechanism (a real video clip, concatenated via a second ffmpeg pass) alongside the older static-image outro card; both can be used together.
- **Wiring:** each slot's value is owned by `App.jsx` (`introVideo`/`outroVideo` state + the shared `pickWrapVideo`/`clearWrapVideo` factory handlers); the `key` doubles as both the multipart upload filename and the value referenced by `intro_video`/`outro_video` in the JSON payload.

### AutoImageGenerator (the AI scene-image panel — substantially extended this pass)
- **Props:** `enabled`, `onToggle`, `styles`, `style`, `onStyleChange`, `count`, `onCountChange`, `minCount=1`, `maxCount=100`, `text`, `duration`, `disabled`, `onImagesReady`, plus new: `characters`, `characterId`, `onCharacterChange`, `imageProviders`, `imageProvider`, `onProviderChange`, `generatedAspect`, `canvas`, `split`.
- **Internal state:** uses the `useSceneImages()` hook (see [FRONTEND.md](FRONTEND.md)) for `{phase, job, error, isBusy, start, reset}`; local `refImage` state (`{file,url}|null`) for the optional reference-image upload; a `lastDelivered` ref to dedupe delivery per completed job id; new local state for the count-suggestion flow (`suggestion`, `suggesting`, `suggestError`).
- **Renders (when `enabled`):** a style `<select>` (with description, now 8 presets), a count `<input type=number>` clamped to `[minCount,maxCount]` **plus a new "Suggest count from script" button** — calls `suggestImageCount({text, duration})` and shows the result as "Use N" / "Dismiss" (a two-step confirm; it never silently overwrites the count you already typed), a `CharacterSelect` dropdown (new — the upload-reference dropzone below is hidden, `{!characterId && (...)}`, whenever a character is picked instead), a new image-provider `<select>` (shows `usable_chain`'s resolved order when the selected provider is itself a fallback chain; a cross-field warning appears when a character is selected but the chosen provider's `supports_reference` is `false`), a "Load the timeline first" hint when `duration` isn't yet known, a "Generate images" button, and — while busy — a progress readout as before.
- **New: a stale-aspect-ratio warning banner.** `aspectStale = generatedAspect && (generatedAspect.canvas !== canvas || generatedAspect.split !== split)` — when true, an amber banner explains that the currently-generated images were baked for a different frame shape than the one selected now and will be cropped to fit, with a nudge to regenerate. This does **not** fix the underlying crop behavior (images are still cover-cropped at render time regardless) — it only surfaces the mismatch as an explicit warning instead of a silent surprise. ⚠️ Despite what its commit message ("fixed image height") suggests, this is a **new warning banner**, not a layout bug fix — no actual image-height logic changed.
- **Delivery:** an effect fires when `phase==='done'`, guarded so each batch delivers exactly once; maps `job.scenes` → `{key: "generated:${job.id}/${s.image}", label: s.prompt?.slice(0,48) ?? s.image, url: sceneImageUrl(job.id, s.image), start: s.start, end: s.end}` and calls `onImagesReady(images)`. `App.jsx` wires this to `handleGeneratedImages`, which auto-creates one sticker placement per image (now cycling Ken Burns effects — see [FRONTEND.md](FRONTEND.md)) and records `generatedAspect` for the banner above.
- **Guard logic:** `canGenerate = enabled && !disabled && !isBusy && text.trim().length>0 && hasDuration` — you must load the timeline (to get a real `duration`) before generating images, same prerequisite as the manual sticker flow.
- **Default flipped:** `App.jsx`'s `autoImageOn` now defaults to `true` — this panel is visible out of the box, not opt-in.

### CharacterLibrary (new)
- **Props:** `characters`, `onRefresh` (re-fetch after a mutation), `disabled`.
- **Renders:** a management panel — a form to create a character (name, description, style, optional seed, optional reference-image upload) via `createCharacter(...)`, and a list of existing characters each with a delete button (`deleteCharacter(id)`). Creating without an uploaded image triggers a **synchronous** backend call that renders one reference image from the description (roughly 15–45s on a Colab-backed provider) — the UI shows a busy/loading state for that duration rather than a poll, since `POST /api/characters` has no job/poll pattern (see [../../YTshortsAnimation/docs/13-CHARACTERS-AND-PROJECTS.md](../../YTshortsAnimation/docs/13-CHARACTERS-AND-PROJECTS.md)).
- **Wiring:** rendered directly in `App.jsx` (not inside `AutoImageGenerator`), alongside `CaptionsToggle`; calls `onRefresh` (→ `refreshCharacters`) after any create/delete so `CharacterSelect` elsewhere in the form sees the change immediately.

### CharacterSelect (new)
- **Props:** `characters`, `value`, `onChange`, `disabled`.
- **Renders:** a plain `<select>` of saved characters — structurally the simplest of this pass's new pickers. Consumed inside `AutoImageGenerator` (above), not standalone in `App.jsx`.

### CaptionPositionSelect (new)
- **Props:** `positions`, `value`, `onChange`, `disabled`.
- **Renders:** a 3-button segmented control (top/center/bottom, `grid-cols-3`) with a tiny 3-bar mini-frame preview — the same visual idiom as `BackgroundToggle`.
- **Wiring:** disabled when `!captionsEnabled` (`disabled={isBusy || !captionsEnabled}`), same conditional-disable pattern as `CaptionStyleSelect`.

### CaptionAnimationSelect (new)
- **Props:** `animations`, `animation`, `onAnimationChange`, `highlights`, `highlight`, `onHighlightChange`, `densities`, `density`, `onDensityChange`, `disabled`.
- **Renders:** a "Word highlight" mode `<select>` (off/sweep/pop), a row of clickable colour-swatch buttons for "Highlight colour" (disabled when the animation mode is `off`), and a "Words per line" density `<select>`.
- **Notes:** the colour swatches use each highlight's `css` hex directly (not a backend-to-frontend hex conversion like `CaptionStyleSelect`'s `assColorToCss` — the registry already carries both an `.ass` and a CSS hex for exactly this reason, see [../../YTshortsAnimation/docs/06-CONFIG-REGISTRIES.md](../../YTshortsAnimation/docs/06-CONFIG-REGISTRIES.md)).

### ImageMotionSelect (new)
- **Props:** `transitions`, `transition`, `onTransitionChange`, `transitionSeconds`, `onTransitionSecondsChange`, `transitionBounds` (`{min,max}`), `kenBurnsLevels`, `kenBurns`, `onKenBurnsChange`, `disabled`.
- **Renders:** an "Image transition" `<select>` (crossfade/slide/dip/none — affects only full-width scene images), a "Handover length" range slider bounded by the server-provided `transitionBounds`, and a "Zoom strength" `<select>` for Ken Burns intensity (off/subtle/medium/strong).
- **Notes:** this is the frontend surface for a genuine backend rendering option (§4.11–4.12 of [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md)), not a client-side-only cosmetic control — "transition" here means the real ffmpeg crossfade/dip/slide chain, not a CSS animation.

### RecentProjects (new)
- **Props:** `disabled`, `onLoad(jobId)`.
- **Renders:** a header button that opens a modal listing recent finished renders (`getRecentJobs()` → `GET /api/jobs`) — each row shows a thumbnail (`<video muted preload="metadata">` pointed at the job's video URL), a text preview of the script, the date, and duration, plus a "Load" button.
- **Wiring:** "Load" calls `App.jsx`'s `handleLoadProject(id)` (see [FRONTEND.md](FRONTEND.md)), which repopulates essentially the entire form from that job's `project.json`/`timestamps.json`/stickers — no new render is started, and no fresh narration is synthesized; see [../../YTshortsAnimation/docs/13-CHARACTERS-AND-PROJECTS.md](../../YTshortsAnimation/docs/13-CHARACTERS-AND-PROJECTS.md) for exactly what is and isn't reused when you later click Generate on a reopened project.

### StylePreview (new)
- **Props:** a wide set of the current form's style-relevant values — caption style/animation/highlight/density, image transition/seconds/Ken Burns zoom, `words` (real probe transcript if available), `generatedImages`, `canvas`/`split`.
- **Renders:** a hand-driven `requestAnimationFrame`-based 9:16 mockup showing captions animating and scene-image crossfades/Ken-Burns motion *before you render anything* — using real probe `words` when available (else a hardcoded Hinglish `SAMPLE_WORDS` fallback) and real `generatedImages` when at least 2 exist (else 3 hardcoded gradient placeholders).
- ⚠️ **This is an approximation, not a preview of the real render.** It re-implements, as documented JS-side approximations, the backend's `_transition_plan`/`_kenburns_chain` (`stitch_video.py`), `group_words` (caption density), and `_karaoke_events` (word-highlight timing) logic — the component's own comments describe it as "an approximation of pixels, not of timing." The real render always goes through the actual ffmpeg filter chains; the two are not guaranteed to look identical.
- **Shared code:** uses `src/lib/ass.js`'s `assColorToCss()`/`captionColors()` — the same helper `CaptionStyleSelect` uses — specifically so the two can't disagree about what a colour looks like.

### ProgressStages
- **Props:** `stages` — the job snapshot's per-stage map `{voice:{status}, captions:{status}, stitch:{status}}` (status ∈ pending/running/done/error).
- **Renders:** three rows with icons — emerald ✓ (done), rose ✕ (error), a CSS spinner (running), slate ○ (pending); the running row is highlighted. Returns `null` when `stages` is falsy (blank until the first poll).
- ⚠️ **Hardcoded `ORDER = ['voice','captions','stitch']` and `STAGE_LABELS`** — the array exists because "objects don't guarantee key order across the wire". If the backend adds a 4th stage, this component silently ignores it.

### VideoResult
- **Props:** `jobId`, `duration` (from `job?.duration`).
- **Renders:** `<video src={videoUrl(jobId)} controls>` (capped at `max-h-[70vh]` so the 9:16 player fits) + a download `<a href={url} download={\`short_${jobId}.mp4\`}>`. Rendered only when `phase === 'done' && job?.has_video`.
- ⚠️ The `download` attribute only forces a filename for **same-origin** URLs; since API_BASE is a different origin (8000 vs the Vite port), browsers may ignore it — works because the backend sets Content-Disposition, but the attribute itself is likely inert cross-origin.

---

## Wiring map (App state ↔ component ↔ wire field)

| App state | Component | Wire field |
|---|---|---|
| `text` | ScriptInput | `text` |
| `voice` | VoiceSelect | `voice` |
| `voiceDescription` | VoiceDescriptionInput (if `isParler`) | `voice_description` |
| `speed` | SpeedSlider | `speed` |
| `clip` | ClipSelect | `clip` |
| `background` | BackgroundToggle | `background` |
| `split` | SplitSelect | `split` |
| `canvas` | CanvasSelect | `canvas` |
| `music` + `musicVolume` | MusicSelect | `music` / `music_volume` |
| `captionStyle` | CaptionStyleSelect | `caption_style` |
| `captionsEnabled` | CaptionsToggle | `captions_enabled` |
| `captionPosition` (new) | CaptionPositionSelect | `caption_position` |
| `captionAnimation`/`Highlight`/`Density` (new) | CaptionAnimationSelect | `caption_animation`/`caption_highlight`/`caption_density` |
| `imageTransition`/`transitionSeconds`/`kenBurns` (new) | ImageMotionSelect | `image_transition`/`transition_seconds`/`ken_burns` |
| `showOutro`/`outro`/`outroSeconds` | OutroToggle | `show_outro`/`outro`/`outro_seconds` |
| `introVideo` / `outroVideo` | IntroOutroVideo | `intro_video` / `outro_video` + `files` |
| `characters`/`imageCharacterId` (new) | CharacterLibrary + CharacterSelect | (indirect — `character_id` via `generateScenes`) |
| `imageProviders`/`imageProvider` (new) | AutoImageGenerator's provider picker | (indirect — `image_provider` via `generateScenes`) |
| `autoImageOn`/`imageStyle`/`imageCount`/`generatedImages` | AutoImageGenerator → merges into `placements` | (indirect — via `stickers[]`) |
| `placements` + `uploads` + `restoredImages` + probe state | StickerTimeline → [STICKER-TIMELINE.md](STICKER-TIMELINE.md) | `stickers` + files |
| — (reads `GET /api/jobs`, writes many fields at once) | RecentProjects → `handleLoadProject` | (form rehydration, not a single field) |
| — (reads many fields, writes nothing) | StylePreview | (read-only mockup) |
| `job.stages` | ProgressStages | (read-only) |
| `job` | VideoResult | (read-only) |

---

## Key takeaways

- 24 "simple" components now (12 original + 2 Phase-3/4 pickers + `CanvasSelect`/`CaptionsToggle` from Phase 5 + 7 new this pass) are mostly stateless controlled components; `VoiceSelect`, `IntroOutroVideo`, `MusicSelect`, `CharacterLibrary`, `RecentProjects`, and `StylePreview` hold local state (preview/upload status, a create/delete form, a modal, or a live animation loop) as the exceptions; `AutoImageGenerator` remains the most substantial component, now with a character picker, provider picker, count-suggestion flow, and a stale-aspect warning layered onto its existing polling hook.
- Options are backend-driven except `BackgroundToggle`'s fixed 2-value list.
- Conditional rendering: `VoiceDescriptionInput` only for Parler; `MusicSelect`'s panel/slider only when a track is picked; `VideoResult` only when done-with-video; `AutoImageGenerator`'s generate button only when a timeline duration exists (and its reference-upload field hides when a character is picked instead); `CaptionStyleSelect`/`CaptionPositionSelect` disabled when `CaptionsToggle` is off; `CaptionAnimationSelect`'s colour swatches disabled when its own animation mode is off.
- `OutroToggle` (static image, now a real card registry with a thumbnail grid) and `IntroOutroVideo` (real video clips) are two independent, simultaneously-usable outro mechanisms — don't confuse them.
- `CanvasSelect`'s landscape option triggers a "always full-screen" rule that's duplicated (not shared) between frontend and backend — `ClipSelect`/`SplitSelect` get disabled accordingly; `OutroToggle`'s card grid independently filters by the same `canvas` value.
- Two components this pass have commit-message/behavior mismatches worth knowing: `AutoImageGenerator`'s stale-aspect-ratio warning shipped under a commit named "fixed image height" (no height logic actually changed), and `RecentProjects` shipped under a commit named "added tentative image number prediction" (which really described `AutoImageGenerator`'s much smaller count-suggestion feature).
- Watch the small traps: hardcoded 1920 in SplitSelect (still wrong for landscape), hardcoded stage ORDER in ProgressStages, the cross-origin `download` caveat, the emotion-tag table that duplicates backend semantics, `IntroOutroVideo`'s client-unenforced 5s cap, `AutoImageGenerator`'s hardcoded `15%` progress-bar fallback, `StylePreview`'s explicit approximation of real backend timing/filter math, and three independent copy-pasted `Audio()` preview implementations (VoiceSelect, MusicSelect, StickerTimeline) with no shared hook.
