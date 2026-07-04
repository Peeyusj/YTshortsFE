# StickerTimeline — Deep Dive (YTshortsFE)

**What this covers:** `src/components/StickerTimeline.jsx` (~662 lines) — the most complex UI in the project, explained so a beginner React dev could rebuild it. **Read first:** [FRONTEND.md](FRONTEND.md); the backend side of stickers is in [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4 and [../../YTshortsAnimation/docs/07-DATA-FLOW.md](../../YTshortsAnimation/docs/07-DATA-FLOW.md).

---

## What it is

A **Canva-style, audio-synced timeline editor** for placing sticker images ("Feature #3"). You upload images, run a one-off voice synthesis ("probe") to learn the narration's *true* duration and per-word timings, then drag time-range blocks on a track: "show image X from second A to second B, at coarse screen position (x,y)". The output is a list of `{id, image, start, end, x, y}` placements.

> **Disambiguation:** despite the name overlap in some notes, this has **nothing to do with "expressions"** — those are emotion tags handled by the separate `ExpressionGuide` component. The only "expressions" near stickers are the ffmpeg overlay coordinate expressions on the *backend*.

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

Helpers: `nextId()` → `p0`, `p1`, … (module-level counter, survives remount, resets on reload; client-only, stripped before sending); `clamp(v,lo,hi)` (⚠️ `clamp(NaN,…)` returns `NaN` — see the numeric-input bug); `round2(v)` (2-decimal storage); `niceStep(pps)` (ruler tick spacing ≥48px); `fmtClock`/`fmtTick` (time labels).

---

## Props — fully controlled by App

The component holds **no placement data of its own**:

| Prop | From `App.jsx` |
|---|---|
| `duration` | `timelineDuration` — real seconds from `/api/probe`; `null` = locked |
| `words` | `timelineWords` — `[{word,start,end}]` |
| `probeId` | `probeId` — handle for `GET /api/probe/{id}/audio` |
| `loading` | `probing` |
| `onLoadTimeline` | `handleLoadTimeline` |
| `uploads` | `[{key,label,file,url}]` |
| `onAddFiles` / `onRemoveUpload` | handlers |
| `placements` | `placements` |
| `onChange` | `setPlacements` |
| `disabled` | `isBusy` |

Uploads live in `App` (not here) so it can send the real `File` objects at generation time; this component only ever sees `{key,label,url}` slices.

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

**Derived:** `secToPx = s => s * pps` (the core mapping — the whole layout is `left: secToPx(start)`, `width: secToPx(end-start)` absolute positioning); `totalW = max(secToPx(duration), 320)`; `audioSrc = probeId ? probeAudioUrl(probeId) : null`.

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
- `trackUp`: normalize `a=min(start,end)`, `b=max(...)`; **commit only if `b-a >= MIN_LEN` (0.3s)** → `onChange([...placements, {id:nextId(), image:selectedKey, start:round2(a), end:round2(b), x:'center', y:'upper'}])`. A sub-0.3s drag (or a plain click) creates nothing. The draft renders as a translucent emerald preview rectangle.

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

**Playback:** a hidden `<audio ref={audioRef} src={audioSrc} preload="auto">` streams the probe mp3 (`GET /api/probe/{id}/audio`). `togglePlay` does `a.play().then(...).catch(() => setPlaying(false))` — the catch handles browser autoplay-policy rejections. Changing `probeId` resets `playing=false, cursor=0`.

**Playhead animation:** a `requestAnimationFrame` loop runs **only while playing**, copying `audio.currentTime` into `cursor` ~60fps. Why not the native `timeupdate` event? It fires only ~4Hz — too coarse for a smooth sweeping playhead. The playhead is a `pointer-events-none` 1px rose line at `left: secToPx(cursor)`.

**Waveform** (effect keyed on `[probeId, duration]`):
1. `fetch(probeAudioUrl(probeId))` → `arrayBuffer()`. ⚠️ **The mp3 is downloaded twice total** — here for decoding, and again by the `<audio>` element for playback (no shared cache). ⚠️ `resp.ok` is never checked — a 404 returns JSON bytes that fail in `decodeAudioData`, caught → `setPeaks(null)` (graceful by accident).
2. `new AudioContext()` → `decodeAudioData(buf)` → `ctx.close()` immediately (only needed for decoding).
3. **Peak reduction:** channel 0 only, `block = floor(raw.length / 900)` samples per bucket, store the max absolute sample per bucket, normalize all by the global max (guarding silence with `|| 1`). Result: 900 floats in `[0,1]`.
4. A `cancelled` flag prevents `setState` after the effect is superseded. Any decode error → `setPeaks(null)` (playback still works without the waveform).

**Canvas painting** (effect keyed on `[peaks, totalW]`): the canvas `width={totalW}` attribute changes with zoom, which auto-clears it, then this repaints. Per bar: `bw = w/900`, height `= max(1, peak * h * 0.92)`, drawn centred, fill `rgba(129,140,248,0.55)` (indigo-400 @ 55%). ⚠️ For a very long narration at max zoom (e.g. 3 min × 160pps ≈ 28,800px) the canvas width approaches the browser limit (~32,767px).

**Word chips:** each probe word is an absolutely positioned button at `left: secToPx(w.start)`, `width: max(secToPx(w.end-w.start), 5)` (5px min so tiny words stay clickable), tooltip `"{word} · {start}–{end}s"`. `onPointerDown` stops propagation (so tapping a word doesn't scrub); `onClick` does `seekTo(w.start)` — click a word to jump there. ⚠️ Accesses `w.start/end` with `.toFixed` and no null-guard — a malformed probe response would throw during render.

---

## Editor panel + validation

When a block is selected:
- **Numeric start/end inputs** (`type="number" step="0.1"`): start clamped `[0, end - MIN_LEN]`, end clamped `[start + MIN_LEN, duration]`, via `round2(clamp(+e.target.value, ...))`. ⚠️ **NaN bug:** in transient invalid states (e.g. the field contains `-` or `e`), `+value` can be `NaN` → `clamp(NaN,…)=NaN` → the placement gets `start:NaN`, breaking its rendered `left/width` until a valid number is typed. Low severity.
- **Position grid** (3×2): buttons labelled `"upper-left"`, `"upper-center"`, … built by nesting `Y_OPTS.map(y => X_OPTS.map(x => ...))`; clicking sets `{x, y}`. So position is a **6-preset grid, not free pixel placement** — the backend converts these presets to pixels.
- **Delete** removes the block and clears selection.

**Soft warnings** (amber, advisory — never block generation): `tooMany` when `placements.length > 5`; `tooShort` for any block under 2s ("may flash by too fast").

---

## Serialization → backend (condensed)

On Generate (in `App.jsx` + `client.js`): the client `id` is stripped (`placements.map(({id, ...rest}) => rest)` → `{image,start,end,x,y}`); only uploads referenced by a placement are sent; each is appended to FormData with its **key as the filename**. The backend's `StickerPlacement` model validates `start>=0`, `end>0`, and the x/y Literals — but ⚠️ **not** `end>start`, `end<=duration`, or that `image` matches a real upload. `stitch_video.py` then sanitizes (basename the image, clamp `end` to duration, skip missing/backwards), and renders each as an ffmpeg `overlay=...:enable='between(t,start,end)'` chained in array order (so later placements sit on top, and burned captions sit on top of all stickers). Full detail: [../../YTshortsAnimation/docs/04-PIPELINE.md](../../YTshortsAnimation/docs/04-PIPELINE.md) §4.3–4.5.

⚠️ **Stale placements:** editing the script invalidates the probe (App effect) but does **not** clear `placements` — blocks placed against the old, longer narration persist and render past the new `totalW` inside the scrollable div; the backend clamps them on render.

---

## Consolidated flags & performance

- Hardcoded waveform colour + all geometry constants; no theming.
- ⚠️ Double mp3 download (waveform decode + `<audio>`).
- ⚠️ `imgTrackRef.setPointerCapture` has no optional-chaining/try-catch (can throw `NotFoundError` for an already-up pointer, e.g. pen), while `scrubDown` uses `?.` — inconsistent.
- ⚠️ NaN via numeric inputs in transient states.
- ⚠️ Placements survive probe invalidation.
- `MAX_STICKERS=5` is advisory only; **no backend cap** on sticker count, upload size, or type (the FE `image/*` filter is the only gate).
- Word chips access `.start/.end` unguarded.
- Module-level `_idCounter` resets on reload (harmless — placements aren't persisted).
- Zoom uses ×/÷1.3 with rounding, so repeated in/out doesn't return to exactly the same value (cosmetic).
- **Performance:** every drag pointermove → `onChange` → `setPlacements` → full App re-render. Acceptable now; memoize first if it grows.
- ✅ No dead code in the component itself — every prop, state, and helper is used.

---

## Key takeaways

- A fully-controlled Canva-style editor: uploads + placements live in `App`; this component draws the timeline and reports `{id,image,start,end,x,y}`.
- The whole layout is `secToPx`-based absolute positioning; `pxToSec` stays correct under scroll via `getBoundingClientRect`.
- Three Pointer-Events drag machines (scrub, create, move, trim) plus a rAF playhead and a decoded 900-bucket waveform.
- Position is a 6-preset grid the backend turns into pixels; z-order = array order; captions always render above stickers.
- Traps: double mp3 download, NaN numeric inputs, placements surviving probe invalidation, and per-pointermove full re-renders.
