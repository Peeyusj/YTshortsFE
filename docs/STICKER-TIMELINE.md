# StickerTimeline — Deep Dive (YTshortsFE)

**What this covers:** `src/components/StickerTimeline.jsx` (grew substantially — now also handles sound effects, slide-in animations, full-width mode, AI-generated images, and a live 9:16 preview panel) — the most complex UI in the project, explained so a beginner React dev could rebuild it. **Read first:** [FRONTEND.md](FRONTEND.md); the backend side of stickers is in [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4 and [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md).

> **Update:** every core mechanic described below (drag machines, waveform, coordinate system) is unchanged from the original design. Phase 3/4: each block can carry an attached sound effect, a slide-in animation, and a "full width" flag; the component renders a live preview of the current playhead position; the `uploads` prop transparently contains both local File uploads AND AI-generated scene images (the component itself doesn't distinguish them — see [12-AI-IMAGE-GENERATION.md](../../YTshortsAnimation/docs/12-AI-IMAGE-GENERATION.md)). **Phase 5 update:** full-width blocks can now use **Ken Burns motion** (zoom-in/zoom-out/pan-in/pan-out) instead of a slide-in, plus a cover/contain fit toggle, plus a dedicated motion-preview mini-player. A prerequisite bug fix also changed how the live preview panel fits full-width images (`objectFit: cover` instead of `contain`) to actually match the real render.
>
> **Latest pass:** two small but real changes, both driven by the new "recent projects" feature elsewhere in the app (see [FRONTEND.md](FRONTEND.md)). (1) The `probeId` prop was replaced by `audioSrc` — a resolved URL string, so this component can play back either a live probe or a reopened past project's narration without knowing which. (2) The `uploads` prop's merge now also includes `restoredImages` (images reused from a reopened project) alongside local uploads and AI-generated images — still one uniform `{key,label,url}` list from this component's point of view. Auto-placed AI images now also default to `sound_id: 'whoosh_soft'` instead of `null` (set in `App.jsx`'s `handleGeneratedImages`, not inside this component).

---

## What it is

A **Canva-style, audio-synced timeline editor** for placing sticker images ("Feature #3"). You upload images (or let the AI image generator populate some automatically), run a one-off voice synthesis ("probe") to learn the narration's *true* duration and per-word timings, then drag time-range blocks on a track: "show image X from second A to second B, at coarse screen position (x,y), optionally full-width, with a slide-in OR Ken Burns motion effect, a cover/contain fit, and an attached sound effect." The output is a list of placements — now `{id, image, start, end, x, y, full_width, animation, animation_duration, sound_id, image_fit}`.

> **Disambiguation:** despite the name overlap in some notes, this has **nothing to do with "expressions"** — those are emotion tags handled by the separate `ExpressionGuide` component. The only "expressions" near stickers are the ffmpeg overlay coordinate expressions on the *backend* (now including the new animation interpolation expressions).

---

## Constants (all hardcoded)

| Name | Value | Purpose |
|---|---|---|
| `X_OPTS` | `['left','center','right']` | horizontal position presets |
| `Y_OPTS` | `['upper','lower']` | vertical presets (top region only) |
| `MAX_STICKERS` | `5` | **soft** warning only — does not block |
| `MIN_SECONDS` | `2` | soft "may flash by" warning threshold |
| `MIN_LEN` | `0.3` | **hard** minimum block length (seconds) |
| `RULER_H` / `WAVE_H` / `TRACK_H` | `20` / `56` / `46` px | strip heights |
| `DEFAULT_PPS` | `70` | default zoom (pixels per second) |
| `MIN_PPS` / `MAX_PPS` | `30` / `160` | zoom clamp |
| `WAVE_BARS` | `900` | waveform resolution (peak buckets), independent of zoom |
| `ANIM_OPTS` | `['none','top','bottom','left','right']` | slide-in direction picker options |
| `ANIM_OFFSET` | a map of direction → CSS offset | drives the illustrative CSS preview animation only — **decoupled from** the real ffmpeg overlay animation (which is computed server-side from `animation`/`animation_duration`) |
| `MX` / `MY` | `6` / `5` (%) | margins used by the live-preview panel's positioning math — mirrors, but does not share code with, the backend's `_overlay_xy` margins |
| `EFFECT_OPTS` (new, Phase 5) | 4 Ken Burns options: Zoom in / Zoom out / Pan → / Pan ← | maps to `animation` values `zoom-in`/`zoom-out`/`pan-in`/`pan-out` |
| `KENBURNS` (new) | `new Set(['zoom-in','zoom-out','pan-in','pan-out'])` | membership check used throughout to branch UI/preview logic |
| `KB_ZOOM` (new) | `1.12` | ⚠️ hardcoded, must match `stitch_video.py`'s `KB_ZOOM` — no shared constant between the two repos |

Helpers: `nextId()` → `p0`, `p1`, … (module-level counter, survives remount, resets on reload; client-only, stripped before sending); `clamp(v,lo,hi)` (⚠️ `clamp(NaN,…)` returns `NaN` — see the numeric-input bug); `round2(v)` (2-decimal storage); `niceStep(pps)` (ruler tick spacing ≥48px); `fmtClock`/`fmtTick` (time labels).

---

## Props — fully controlled by App (3 new props)

The component holds **no placement data of its own**:

| Prop | From `App.jsx` |
|---|---|
| `duration` | `timelineDuration` — real seconds from `/api/probe`; `null` = locked |
| `words` | `timelineWords` — `[{word,start,end}]` |
| `audioSrc` (⚠️ **renamed from `probeId` this pass**) | `App.jsx` now resolves this itself: `probeId ? probeAudioUrl(probeId) : restoredAudioUrl` — a plain URL string, not an id. This lets the same prop serve either a live probe (`GET /api/probe/{id}/audio`) or a reopened past project's narration (`GET /api/jobs/{id}/audio`, see [../../YTshortsAnimation/docs/13-CHARACTERS-AND-PROJECTS.md](../../YTshortsAnimation/docs/13-CHARACTERS-AND-PROJECTS.md)), without this component needing to know which source it's playing. Every internal `[probeId]` effect dependency and the waveform fetch were updated to key off `audioSrc` instead. |
| `loading` | `probing` |
| `onLoadTimeline` | `handleLoadTimeline` |
| `uploads` | `timelineImages` (a `useMemo` merge of local `uploads` + `generatedImages` + `restoredImages` (new — images reused from a reopened past project), all normalized to `{key,label,url}`; the component treats every entry uniformly regardless of source) |
| `onAddFiles` / `onRemoveUpload` | handlers (the latter now branches on a `"generated:"` key prefix in `App.jsx`, not inside this component) |
| `placements` | `placements` |
| `onChange` | `setPlacements` |
| `disabled` | `isBusy` |
| `sounds` (new) | `soundOptions` — the `SOUND_EFFECTS` registry, `[]` default |
| `background` (new) | `background` — `'black'`\|`'white'`, default `'black'`, feeds the live preview panel |
| `topFrac` (new) | `App.jsx`'s `useMemo`, `selectedSplit?.top / 1920` (fallback `1280/1920`) — feeds the live preview panel's top/bottom split |

Uploads (and now generated images) live in `App` so it can send the real `File` objects at generation time; this component only ever sees `{key,label,url}` slices — a generated image's `url` happens to be a server URL instead of a blob URL, but the component code doesn't need to know or care.

---

## State + refs (and why each is a ref)

**Refs** (a ref, not state, means changing it does **not** trigger a re-render — crucial for smooth 60fps dragging):
- `contentRef` — the fixed-width inner div; the seconds↔pixels coordinate frame.
- `imgTrackRef` — the pointer-capture surface for block editing.
- `audioRef` — the hidden `<audio>`.
- `waveCanvasRef` — the waveform canvas.
- `drag` — the **active interaction descriptor** (type + anchor data). Read on every pointermove; a ref so reading it doesn't re-render.
- `scrubbing` — boolean: is the user dragging the playhead.

**State** (changing these *should* re-paint): `selectedKey` (armed upload), `selectedId` (selected block), `draft` (`{start,end}` while drag-creating), `pps` (zoom), `peaks` (900-float waveform or null), `playing`, `cursor` (playhead seconds).

**Derived:** `secToPx = s => s * pps` (the core mapping — the whole layout is `left: secToPx(start)`, `width: secToPx(end-start)` absolute positioning); `totalW = max(secToPx(duration), 320)`. `audioSrc` is now a **prop** (see above), not derived locally from `probeId` — that resolution moved up to `App.jsx` this pass.

---

## The pixels↔seconds coordinate system

```js
function pxToSec(clientX) {
  const rect = contentRef.current.getBoundingClientRect()
  return clamp((clientX - rect.left) / pps, 0, duration)
}
```
`getBoundingClientRect()` is viewport-relative, so when the outer horizontally-scrollable container is scrolled, `rect.left` goes negative and the math **stays correct automatically** — no manual `scrollLeft` tracking. Always clamped to `[0, duration]`. (`contentRef.current` is dereferenced without a null check, but the content div only renders when `duration` is set, and every caller guards on `duration`, so it holds.)

---

## The three drag machines

All use the **Pointer Events + `setPointerCapture`** pattern. For a beginner: on `pointerdown`, calling `element.setPointerCapture(e.pointerId)` tells the browser "send all further pointermove/pointerup for this pointer to *this* element, even if the pointer leaves it". That's what lets you keep dragging a block smoothly even when the cursor wanders off it. The browser auto-releases capture on pointerup (no manual release needed).

### 1. Scrub the playhead (`scrubDown/Move/Up`)
The voice strip (ruler + waveform) captures pointer events: `scrubDown` sets `scrubbing.current = true` and `seekTo(pxToSec(e.clientX))`; `scrubMove` continuously seeks; `scrubUp` clears the flag. `seekTo` clamps, sets `audioRef.currentTime`, and sets `cursor` — so scrubbing works even while **paused**.

### 2. Create a block (`trackDown → trackMove → trackUp`)
Only when an image is **armed** (`selectedKey`) and the timeline is unlocked:
- `trackDown`: `drag.current = {type:'create'}`, `setDraft({start:s, end:s})`, capture the pointer.
- `trackMove` (create branch): updates only `draft.end` — so dragging **left** yields `end < start`; this inversion is deliberately tolerated.
- `trackUp`: normalize `a=min(start,end)`, `b=max(...)`; **commit only if `b-a >= MIN_LEN` (0.3s)** → `onChange([...placements, {id:nextId(), image:selectedKey, start:round2(a), end:round2(b), x:'center', y:'upper', full_width:false, animation:'none', animation_duration:0.4, sound_id:null}])` — the 4 new fields (⚠️ `animation_duration: 0.4` is duplicated as a literal here and in `App.jsx`'s auto-placement code for generated images, no shared constant). A sub-0.3s drag (or a plain click) creates nothing. The draft renders as a translucent emerald preview rectangle.

### 3. Move a block (`beginMove`)
Pointerdown on a block body: `e.stopPropagation()` (so `trackDown` doesn't also start a create), select it, and store `{type:'move', id, grabSec: pxToSec(e.clientX), origStart, origEnd}`. `trackMove` (move branch) does length-preserving translation:
```js
const len = origEnd - origStart
const ns = clamp(origStart + (s - grabSec), 0, duration - len)
updatePlacement(id, { start: round2(ns), end: round2(ns + len) })
```
The `grabSec` anchor means the block moves relative to *where you grabbed it* (no jump-to-cursor), and it's clamped so the block never leaves `[0, duration]`.

### 4. Trim an edge (`beginResize`)
Each block has 1.5px-wide translucent handles at its left/right edges (`cursor-ew-resize`). `beginResize(e, p, side)` stops propagation (so `beginMove` doesn't also fire) and sets `{type:'resize-l'|'resize-r', id, origStart, origEnd}`:
- `resize-l`: `start = round2(clamp(s, 0, origEnd - MIN_LEN))` — the left edge can't cross within 0.3s of the end.
- `resize-r`: `end = round2(clamp(s, origStart + MIN_LEN, duration))`.

### Interaction notes
- **Live parent updates:** `updatePlacement` calls `onChange` (= `setPlacements` in App) on **every pointermove** during move/trim, so the whole App re-renders per mousemove. Fine at this scale; the first thing to memoize if it grows.
- **No overlap prevention, no snapping** — blocks may freely overlap; z-order on the final video is the placements array order (backend chains overlays sequentially, later = on top).

---

## Audio machinery

**Playback:** a hidden `<audio ref={audioRef} src={audioSrc} preload="auto">` streams whichever mp3 `audioSrc` resolves to (a live probe or a reopened past job's narration — see the props table above). `togglePlay` does `a.play().then(...).catch(() => setPlaying(false))` — the catch handles browser autoplay-policy rejections. Changing `audioSrc` resets `playing=false, cursor=0`.

**Playhead animation:** a `requestAnimationFrame` loop runs **only while playing**, copying `audio.currentTime` into `cursor` ~60fps. Why not the native `timeupdate` event? It fires only ~4Hz — too coarse for a smooth sweeping playhead. The playhead is a `pointer-events-none` 1px rose line at `left: secToPx(cursor)`.

**Waveform** (effect keyed on `[audioSrc, duration]`, was `[probeId, duration]`):
1. `fetch(audioSrc)` → `arrayBuffer()`. ⚠️ **The mp3 is downloaded twice total** — here for decoding, and again by the `<audio>` element for playback (no shared cache). ⚠️ `resp.ok` is never checked — a 404 returns JSON bytes that fail in `decodeAudioData`, caught → `setPeaks(null)` (graceful by accident).
2. `new AudioContext()` → `decodeAudioData(buf)` → `ctx.close()` immediately (only needed for decoding).
3. **Peak reduction:** channel 0 only, `block = floor(raw.length / 900)` samples per bucket, store the max absolute sample per bucket, normalize all by the global max (guarding silence with `|| 1`). Result: 900 floats in `[0,1]`.
4. A `cancelled` flag prevents `setState` after the effect is superseded. Any decode error → `setPeaks(null)` (playback still works without the waveform).

**Canvas painting** (effect keyed on `[peaks, totalW]`): the canvas `width={totalW}` attribute changes with zoom, which auto-clears it, then this repaints. Per bar: `bw = w/900`, height `= max(1, peak * h * 0.92)`, drawn centred, fill `rgba(129,140,248,0.55)` (indigo-400 @ 55%). ⚠️ For a very long narration at max zoom (e.g. 3 min × 160pps ≈ 28,800px) the canvas width approaches the browser limit (~32,767px).

**Word chips:** each probe word is an absolutely positioned button at `left: secToPx(w.start)`, `width: max(secToPx(w.end-w.start), 5)` (5px min so tiny words stay clickable), tooltip `"{word} · {start}–{end}s"`. `onPointerDown` stops propagation (so tapping a word doesn't scrub); `onClick` does `seekTo(w.start)` — click a word to jump there. ⚠️ Accesses `w.start/end` with `.toFixed` and no null-guard — a malformed probe response would throw during render.

---

## Sound effects (new)

Each block can have an attached sound effect, edited from the block editor panel: a `<select>` (populated from the `sounds` prop) plus a ▶ preview button. `playSoundPreview(soundId)` lazily creates a shared `sfxPreviewRef.current = new Audio()`, sets `.src = soundAudioUrl(soundId)`, and plays — the identical pattern to `VoiceSelect`'s voice preview and the waveform `<audio>` element, just a third independent `Audio()` instance. This is purely **per-placement metadata** (`sound_id`), not a separate timeline track — there's no dedicated sound-effect lane, no independent start offset; the sound always fires at the sticker's own `start` time (see [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4.7 for how the backend turns this into an `adelay` ffmpeg chain).

---

## Full-width mode, animations (slide-in OR Ken Burns), and fit

- **`full_width`** is a checkbox in the block editor. When enabled, it automatically resets `animation` to `'none'` if it was `'left'`/`'right'` (a left/right slide doesn't make sense for a block that already spans the full width) — one of two cross-field validation rules in the component (the other, new in Phase 5, is below). Intended use: an AI-generated scene image acting as a full backdrop across the whole caption band, rather than a small badge.
- **`animation`** is a direction picker (`ANIM_OPTS`: none/top/bottom/left/right) plus an `animation_duration` speed slider (0.1–1.5s, step 0.05) for the slide-in family. A "▶ Preview" button replays an **illustrative, CSS-only** animation using `ANIM_OFFSET` and a double-`requestAnimationFrame` snap-then-transition trick (render the element off-screen with no transition, then on the next frame apply the transition and move it to its resting position — this two-step dance is what makes the browser actually animate the move instead of snapping instantly). ⚠️ **This CSS preview is cosmetic only** — the real animation the video actually gets is computed server-side as a time-interpolated ffmpeg overlay `x`/`y` expression (see [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4.5); the two are not the same code path and could in principle drift apart in feel.

### Ken Burns motion (new, Phase 5)

A second row of controls, **only enabled when `full_width` is true** (disabled with a "(turn on full width to use)" hint otherwise — the new cross-field rule): four toggle buttons (`EFFECT_OPTS`: Zoom in / Zoom out / Pan → / Pan ←) that set `animation` to one of the `KENBURNS` values via `updatePlacement(selected.id, { animation: on ? 'none' : effect.id })`. Selecting a Ken Burns effect is mutually exclusive with the slide-in directions — they share the same `animation` field, just different value ranges.

- **Fit toggle:** a second button pair, "Cover (crop to fill)" / "Contain (no crop)", writes the new `image_fit` field — also full-width-only, and independent of which animation (if any) is selected. `image_fit` defaults to `"cover"` on every new placement (including AI-generated ones auto-placed by `App.jsx`).
- **Motion preview mini-player:** rendered only when the selected block's `animation` is a Ken Burns value. A dedicated "▶ Preview motion" button drives `previewKenBurns(duration)` — a `requestAnimationFrame` loop over `Math.max(0.4, seconds)` (capped at 2.5s) updating a `kbProg` state variable (0→1), which feeds `kenBurnsTransform(effect, progress)`: a small helper that mirrors the *server-side* `zoompan` math (see the pipeline doc) in CSS `scale()`/`translateX()`, applied to a live `<img>` of the actual selected image in a small aspect-matched box. `kbRaf` (a ref) holds the animation-frame handle and is cancelled on unmount.
- **The same `kenBurnsTransform` helper also drives the main live-preview panel** (below) — but there, progress comes from the **scrub playhead** (`(cursor - start) / (end - start)`), not a real-time loop, so scrubbing through a Ken Burns sticker visibly "scrubs" its zoom/pan too.
- ⚠️ Both the manual `KB_ZOOM = 1.12` literal and the CSS-approximation nature of the whole preview are worth remembering: **this component's motion preview is always an approximation** of the real `zoompan`-filter render, not a pixel-accurate one.

---

## The live preview panel

A right-hand sidebar (`lg:w-60`) that renders a scaled-down mockup of the actual output frame at the current playhead position:
- `activePlacements` = placements where `cursor` falls within `[start, end]` — i.e., "what would be visible right now."
- `previewStyle(p)` maps each active placement's `x`/`y`/`full_width` onto CSS percentages, using `MX`/`MY` margin constants that **mirror but don't share code with** the backend's `_overlay_xy` margins (a drift risk noted in the flags below). For a Ken Burns placement, it additionally applies `kenBurnsTransform` (see above) driven by the scrub position.
- The mockup itself is split into a top region (coloured per the `background` prop, holding the active placements) and a bottom "gameplay clip" placeholder region, proportioned by the `topFrac` prop (which in turn comes from the currently-selected split's `top` height ÷ 1920 — ⚠️ this ratio assumes a 1920-tall canvas and doesn't account for the Phase 5 landscape canvas, where the real frame is only 1080 tall).
- **Phase 5 fix — full-width images now use `objectFit: cover` + `inset: 0`** (previously `contain` + inset margins) so the preview panel's rendering of a full-width sticker actually matches how `stitch_video.py` covers/crops it in the real render — the commit message calls this out explicitly as "the fix for 'preview images look misaligned vs the video.'" This was a prerequisite for the Ken Burns feature to preview sensibly, but it changed how *all* full-width previews render, Ken Burns or not.
- Images render via `<img src={uploads.find(u => u.key === p.image)?.url}>` — works identically for local uploads and AI-generated images, since `timelineImages` already normalized both into the same `{key,label,url}` shape.

This gives a rough "what will this actually look like" preview without needing a full render — genuinely useful given how many independent knobs (position, full-width, split, background) now affect final placement.

---

## Editor panel + validation

When a block is selected:
- **Numeric start/end inputs** (`type="number" step="0.1"`): start clamped `[0, end - MIN_LEN]`, end clamped `[start + MIN_LEN, duration]`, via `round2(clamp(+e.target.value, ...))`. ⚠️ **NaN bug:** in transient invalid states (e.g. the field contains `-` or `e`), `+value` can be `NaN` → `clamp(NaN,…)=NaN` → the placement gets `start:NaN`, breaking its rendered `left/width` until a valid number is typed. Low severity.
- **Position grid** (3×2): buttons labelled `"upper-left"`, `"upper-center"`, … built by nesting `Y_OPTS.map(y => X_OPTS.map(x => ...))`; clicking sets `{x, y}`. So position is a **6-preset grid, not free pixel placement** — the backend converts these presets to pixels. (Irrelevant when `full_width` is on, since the overlay always spans the full width regardless of `x`.)
- **Sound effect select + preview** — see above.
- **Full-width toggle + animation controls** (slide-in OR Ken Burns) + **fit toggle** (new) — see above.
- **Delete** removes the block and clears selection.

**Soft warnings** (amber, advisory — never block generation): `tooMany` when `placements.length > 5`; `tooShort` for any block under 2s ("may flash by too fast").

---

## Serialization → backend (condensed, now more fields)

On Generate (in `App.jsx` + `client.js`): the client `id` is stripped (`placements.map(({id, ...rest}) => rest)` → `{image,start,end,x,y,full_width,animation,animation_duration,sound_id}`); only uploads referenced by a placement are sent; each is appended to FormData with its **key as the filename** (a `"generated:..."` key has no corresponding upload — nothing to send, the backend resolves it server-side). The backend's `StickerPlacement` model validates `start>=0`, `end>0`, and the x/y Literals — but ⚠️ **not** `end>start`, `end<=duration`, or that `image` matches a real upload or a valid generated-image reference. `pipeline.py` resolves both image-reference forms to a plain filename (copying AI-generated PNGs into the job's `stickers/` dir); `stitch_video.py` then sanitizes (basename the image, clamp `end` to duration, resolve `sound_path`, skip missing/backwards), and renders each as an ffmpeg `overlay=...:enable='between(t,start,end)'` chained in array order (so later placements sit on top, and burned captions sit on top of all stickers), with the new animation/full-width/SFX handling layered in. Full detail: [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4.3–4.9 and [../../YTshortsAnimation/docs/12-AI-IMAGE-GENERATION.md](../../YTshortsAnimation/docs/12-AI-IMAGE-GENERATION.md).

⚠️ **Stale placements:** editing the script invalidates the probe (App effect) but does **not** clear `placements` — blocks placed against the old, longer narration persist and render past the new `totalW` inside the scrollable div; the backend clamps them on render. This now also applies to AI-generated placements (`App.jsx`'s `handleGeneratedImages` replaces the *image* batch but doesn't re-validate existing placement timing against a changed duration either).

---

## Consolidated flags & performance

- Hardcoded waveform colour + all geometry constants; no theming.
- ⚠️ Double mp3 download (waveform decode + `<audio>`) — now a THIRD independent `Audio()` pattern exists for sound-effect preview, following the same lazy-create-and-reuse approach (not itself a bug, just worth noting the pattern repeats three times with no shared hook).
- ⚠️ `imgTrackRef.setPointerCapture` has no optional-chaining/try-catch (can throw `NotFoundError` for an already-up pointer, e.g. pen), while `scrubDown` uses `?.` — inconsistent.
- ⚠️ NaN via numeric inputs in transient states.
- ⚠️ Placements survive probe invalidation.
- `MAX_STICKERS=5` is advisory only; **no backend cap** on sticker count, upload size, or type (the FE `image/*` filter is the only gate) — now also no backend cap on AI-generated image count beyond the `[1,60]` request-level bound (doubled from 30 in Phase 5).
- Word chips access `.start/.end` unguarded.
- Module-level `_idCounter` resets on reload (harmless — placements aren't persisted).
- Zoom uses ×/÷1.3 with rounding, so repeated in/out doesn't return to exactly the same value (cosmetic).
- **Performance:** every drag pointermove → `onChange` → `setPlacements` → full App re-render. Acceptable now; memoize first if it grows — the live preview panel adds another render dependency (`cursor`) that fires during the rAF playhead loop too, worth watching if the component ever feels sluggish. Ken Burns adds a second, separate rAF loop (`kbRaf`) when the motion-preview mini-player is active.
- ⚠️ `MX`/`MY` preview-panel margins duplicate the backend's `_overlay_xy` margins with no shared source of truth — if the backend's sticker margin ever changes, this preview silently drifts out of sync with the real output.
- ⚠️ `animation_duration` default `0.4` is a literal duplicated between this component (manual block creation) and `App.jsx` (auto-placement for generated images).
- ⚠️ **New (Phase 5):** `KB_ZOOM = 1.12` is hardcoded here AND independently in `stitch_video.py` — no shared constant; a change to one without the other would desync the preview from the real render.
- ⚠️ **New:** the `topFrac` preview-panel ratio still assumes a 1920-tall canvas — it doesn't account for the Phase 5 landscape canvas (1080 tall), so the preview's top/bottom proportions would misrepresent a landscape render.
- ✅ Still no genuinely dead code in the component itself — every prop, state, and helper is used, including the new ones.

---

## Key takeaways

- A fully-controlled Canva-style editor: uploads (now merged with AI-generated images) + placements live in `App`; this component draws the timeline and reports `{id,image,start,end,x,y,full_width,animation,animation_duration,sound_id,image_fit}`.
- The whole layout is `secToPx`-based absolute positioning; `pxToSec` stays correct under scroll via `getBoundingClientRect`.
- Three Pointer-Events drag machines (scrub, create, move, trim) plus a rAF playhead and a decoded 900-bucket waveform — all unchanged from the original design.
- Position is a 6-preset grid (or full-width) the backend turns into pixels/expressions; z-order = array order; captions always render above stickers.
- Per-placement sound effects (a third lazily-created `Audio()` instance, alongside VoiceSelect and MusicSelect), a slide-in **or Ken Burns** animation picker (both with CSS-only illustrative previews, decoupled from the real server-side ffmpeg render), a cover/contain fit toggle, and a live preview panel that mirrors — but doesn't share code with — the backend's positioning math.
- Ken Burns motion reuses the slide-in animation's UI slot (same `animation` field, 4 more allowed values) and gets its own dedicated motion-preview mini-player, separate from the always-visible main preview panel.
- Traps: double (now effectively triple-pattern) audio handling, NaN numeric inputs, placements surviving probe invalidation, per-pointermove full re-renders, and two new duplicated-constant drift risks (preview margins, animation duration default).
