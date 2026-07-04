# Component Reference (YTshortsFE)

**What this covers:** all 12 of the simpler components in `src/components/`. The big `StickerTimeline` has its own doc: [STICKER-TIMELINE.md](STICKER-TIMELINE.md). **Read first:** [FRONTEND.md](FRONTEND.md) for the `App.jsx` state model these bind to.

---

## Shared patterns (true for all 12)

1. **Stateless & fully controlled.** None contains `useState`/`useEffect`/`useRef`. All state lives in `App.jsx`; each control gets `value` + `onChange` (or equivalents) + `disabled` and pushes changes up.
2. **`disabled` is always `isBusy`** — the whole form freezes during a render.
3. **Backend-driven options.** No component hardcodes voice/clip/split/music ids — they arrive as props from `App.jsx`'s mount `Promise.all`. (The one exception: `BackgroundToggle`, whose two options are a fixed frontend list.)
4. **Dark Tailwind theme** — slate-950 bg, slate-100 text, indigo accent, emerald=success, rose=error, amber=warning.
5. **Zero orphans.** All 12 are imported and rendered in `App.jsx`.

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

### VoiceSelect
- **Props:** `voices`, `value`, `onChange`, `disabled`.
- **Renders:** a `<select>` of `<option value={v.id}>{v.label}</option>`. Disabled when `disabled || voices.length === 0` (prevents interacting with an empty dropdown before data loads).
- **Notes:** the voice objects carry more than this uses — `App.jsx` reads `.engine` (for `isParler`) and `.default_description` (Parler placeholder) elsewhere. Default comes from the API (`setVoice(voiceData.default)`), no frontend-hardcoded voice id.

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
- ⚠️ **Magic number:** `topPct = active ? (active.top / 1920) * 100 : 66.7` — hardcodes **1920** as the total canvas height (duplicated from the backend). If the resolution ever changed, or a split's top+bottom ≠ 1920, the preview would misrepresent proportions. Fallback `66.7` used before options load.

### MusicSelect
- **Props:** `music` (`{id,label,path,artist,mood,description}`), `value`, `onChange`, `volume`, `onVolumeChange`, `disabled`. The richest option component.
- **Renders three parts:** (1) a `<select>` with a hardcoded first option "None — narration only" (⚠️ **not** disabled when the list is empty, unlike the others, because "None" is always valid); (2) a metadata panel (artist/mood pill/description) shown **only when a track is selected**; (3) a volume slider shown only when a track is selected.
- ⚠️ **Unit conversion:** state is a 0..1 float ("matches the backend"), but the slider works in integer percent — displays `Math.round(volume*100)`, emits `parseInt(...)/100`. Labels "Subtle" / "As loud as voice".
- **Notes:** defaults from the API (`music: null → ''`, `default_volume`). The `0.18` fallback also appears as the `App.jsx` initial state (duplicated). On generate, `music: music || null`.

### OutroToggle
- **Props:** `value` (bool), `onChange`, `disabled`, `available` (**tri-state**: true/false/undefined).
- **Renders:** a checkbox "Show outro card (2s at the end)".
- ⚠️ **Tri-state handling:** the warning "No assets/outroImage.png on the backend" shows only on strict `available === false`; when health hasn't loaded (`undefined`) no warning shows. `available` comes from `health?.outro`. The toggle stays functional even if the asset is missing (backend just skips the outro). Default `true` (frontend-owned), sent as `show_outro`.

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
| `music` + `musicVolume` | MusicSelect | `music` / `music_volume` |
| `showOutro` | OutroToggle | `show_outro` |
| `placements` + `uploads` + probe state | StickerTimeline → [STICKER-TIMELINE.md](STICKER-TIMELINE.md) | `stickers` + files |
| `job.stages` | ProgressStages | (read-only) |
| `job` | VideoResult | (read-only) |

---

## Key takeaways

- All 12 are stateless controlled components; state and defaults live in `App.jsx`; `disabled` = `isBusy` everywhere.
- Options are backend-driven except `BackgroundToggle`'s fixed 2-value list.
- Conditional rendering: `VoiceDescriptionInput` only for Parler; `MusicSelect`'s panel/slider only when a track is picked; `VideoResult` only when done-with-video.
- Watch the small traps: hardcoded 1920 in SplitSelect, hardcoded stage ORDER in ProgressStages, the cross-origin `download` caveat, and the emotion-tag table that duplicates backend semantics.
