// Canva-like image timeline (Feature #3, manual placement — images uploaded per
// session).
//
// The idea: "based on the voice, one strip goes across; you see at what timestamp
// what is being said, and against that you drop an image and choose how long it
// shows." So this is an editor, not a plain duration bar:
//
//   1. Upload images (drag-drop or picker). They live only in this browser
//      session (no server library).
//   2. Click "Load timeline" — App calls POST /api/probe, which synthesizes the
//      narration once and returns its real duration, per-word timings, and a
//      probe_id. We draw everything against TRUE seconds.
//   3. The VOICE STRIP shows the audio waveform with each spoken word laid out at
//      its real timestamp. Play/scrub it to hear exactly what's said when; the
//      playhead sweeps across.
//   4. Pick an uploaded image, then drag across the IMAGE TRACK to create a block
//      spanning the time you want it on screen. Drag the block body to move it,
//      or drag either edge to trim its in/out — "up to this long this image
//      shows". Fine-tune with the numeric start/end inputs.
//   5. Set the block's coarse position (left/center/right × upper/lower) or delete.
//
// Uploads are owned by the parent (App) so it can send the actual File objects on
// Generate. This component receives them as `uploads` = [{ key, label, url }] and
// reports placements via onChange as { id, image, start, end, x, y } where `image`
// is the upload's unique `key`. That output shape is UNCHANGED from before, so the
// backend/stitch contract is untouched — this is purely a richer editing surface.
import { useEffect, useRef, useState } from 'react'
import { soundAudioUrl } from '../api/client'

const X_OPTS = ['left', 'center', 'right']
const Y_OPTS = ['upper', 'lower']
const ANIM_OPTS = [
  { id: 'none', label: 'None' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
]
// CSS-only illustration of each direction's off-screen starting transform —
// purely for the in-browser preview; the real render uses the ffmpeg overlay
// expressions built in stitch_video.py's _overlay_xy().
const ANIM_OFFSET = {
  none: 'translate(0, 0)',
  top: 'translateY(-140%)',
  bottom: 'translateY(140%)',
  left: 'translateX(-140%)',
  right: 'translateX(140%)',
}

// Ken Burns motion effects (full-width only): zoom/pan that animates the image
// CONTENT across the whole on-screen window so a still image looks "alive".
// These map 1:1 to stitch_video.py's _kenburns_chain (zoompan) values.
const EFFECT_OPTS = [
  { id: 'zoom-in', label: 'Zoom in' },
  { id: 'zoom-out', label: 'Zoom out' },
  { id: 'pan-in', label: 'Pan →' },
  { id: 'pan-out', label: 'Pan ←' },
]
const KENBURNS = new Set(EFFECT_OPTS.map((e) => e.id))
// End zoom for zoom-in/out; constant zoom held during pans. MUST match
// stitch_video.py's KB_ZOOM so the preview matches the render.
const KB_ZOOM = 1.12

// The live CSS transform for a Ken Burns effect at progress p (0..1 across the
// image's on-screen window). Mirrors the zoompan crop math: zooms scale about
// centre; pans hold the zoom and glide the (over-scaled) image sideways. The
// image is object-cover inside an overflow-hidden region, so the pan overflow
// is clipped exactly like the ffmpeg crop window.
function kenBurnsTransform(effect, p) {
  const dz = KB_ZOOM - 1
  switch (effect) {
    case 'zoom-in':
      return `scale(${(1 + dz * p).toFixed(4)})`
    case 'zoom-out':
      return `scale(${(KB_ZOOM - dz * p).toFixed(4)})`
    case 'pan-in': // left -> right
      return `scale(${KB_ZOOM}) translateX(${((dz * (0.5 - p)) / KB_ZOOM * 100).toFixed(3)}%)`
    case 'pan-out': // right -> left
      return `scale(${KB_ZOOM}) translateX(${((dz * (p - 0.5)) / KB_ZOOM * 100).toFixed(3)}%)`
    default:
      return 'none'
  }
}
const MAX_STICKERS = 5 // soft guardrail
const MIN_SECONDS = 2 // soft quality warning threshold
const MIN_LEN = 0.3 // shortest block you can drag/trim to, in seconds

// Timeline geometry. Everything scales from `pps` (pixels-per-second), which the
// zoom control tweaks; a wider strip = more room to read words / place precisely.
const RULER_H = 20
const WAVE_H = 56
const TRACK_H = 46
const DEFAULT_PPS = 70
const MIN_PPS = 30
const MAX_PPS = 160
const WAVE_BARS = 900 // waveform resolution (peak buckets), independent of zoom

let _idCounter = 0
const nextId = () => `p${_idCounter++}`

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round2 = (v) => +v.toFixed(2)

// A "nice" ruler step (seconds) so tick labels stay ~>=48px apart at this zoom.
function niceStep(pps) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60]) if (s * pps >= 48) return s
  return 60
}
// mm:ss for the transport clock; short 's' labels for the ruler.
const fmtClock = (s) => {
  const t = Math.max(0, s || 0)
  const m = Math.floor(t / 60)
  const sec = Math.floor(t % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const fmtTick = (t) =>
  t >= 60 ? fmtClock(t) : Number.isInteger(t) ? `${t}s` : `${t.toFixed(1)}s`

export default function StickerTimeline({
  duration,
  words = [],
  audioSrc,
  loading,
  onLoadTimeline,
  uploads,
  onAddFiles,
  onRemoveUpload,
  placements,
  onChange,
  disabled,
  sounds = [],
  background = 'black',
  topFrac = 1280 / 1920,
}) {
  const fileInputRef = useRef(null)
  const contentRef = useRef(null) // fixed-width inner; the seconds<->pixels frame
  const imgTrackRef = useRef(null) // pointer-capture surface for block editing
  const audioRef = useRef(null)
  const waveCanvasRef = useRef(null)
  const sfxPreviewRef = useRef(null) // reused <audio> for the sound-effect preview button
  const drag = useRef(null) // active block interaction (see beginX handlers)
  const scrubbing = useRef(false)

  const [selectedKey, setSelectedKey] = useState(null) // upload chosen to place
  const [selectedId, setSelectedId] = useState(null) // placed block being edited
  const [draft, setDraft] = useState(null) // { start, end } while dragging a new block
  const [dragOver, setDragOver] = useState(false)
  const [pps, setPps] = useState(DEFAULT_PPS)
  const [peaks, setPeaks] = useState(null) // normalized waveform samples [0..1]
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(0) // playhead position in seconds
  const [stagePos, setStagePos] = useState('on') // CSS slide-in preview: 'off' | 'on'
  const [kbProg, setKbProg] = useState(1) // 0..1 progress driving the Ken Burns motion preview
  const kbRaf = useRef(null)

  const secToPx = (s) => s * pps
  const totalW = duration ? Math.max(secToPx(duration), 320) : 0

  // ---- upload handling (unchanged behaviour) --------------------------------
  function handleFiles(fileList) {
    const imgs = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (imgs.length) onAddFiles(imgs)
  }

  // ---- pixels <-> seconds ----------------------------------------------------
  // Measured off the fixed-width inner, whose left edge tracks horizontal scroll
  // automatically (getBoundingClientRect is viewport-relative), so the math holds
  // even when the timeline is scrolled.
  function pxToSec(clientX) {
    const rect = contentRef.current.getBoundingClientRect()
    return clamp((clientX - rect.left) / pps, 0, duration)
  }

  // ---- audio: playback + playhead -------------------------------------------
  // New narration (audio source change — a fresh probe, or a restored project's
  // past audio) => stop and rewind.
  useEffect(() => {
    setPlaying(false)
    setCursor(0)
  }, [audioSrc])

  // Smoothly follow the audio while it plays (timeupdate is too coarse for a
  // playhead). Runs only while `playing`, so it costs nothing when paused.
  useEffect(() => {
    if (!playing) return
    let raf
    const tick = () => {
      const a = audioRef.current
      if (a) setCursor(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      a.pause()
      setPlaying(false)
    }
  }
  function seekTo(sec) {
    const s = clamp(sec, 0, duration || 0)
    const a = audioRef.current
    if (a) a.currentTime = s
    setCursor(s)
  }

  // Scrub the playhead by dragging anywhere on the voice strip (ruler/waveform).
  function scrubDown(e) {
    if (!duration) return
    scrubbing.current = true
    seekTo(pxToSec(e.clientX))
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function scrubMove(e) {
    if (scrubbing.current) seekTo(pxToSec(e.clientX))
  }
  function scrubUp() {
    scrubbing.current = false
  }

  // ---- waveform: fetch the audio, decode, reduce to peak buckets -------------
  useEffect(() => {
    if (!audioSrc || !duration) {
      setPeaks(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch(audioSrc)
        const buf = await resp.arrayBuffer()
        const AC = window.AudioContext || window.webkitAudioContext
        const ctx = new AC()
        const audioBuf = await ctx.decodeAudioData(buf)
        ctx.close()
        if (cancelled) return
        const raw = audioBuf.getChannelData(0)
        const block = Math.max(1, Math.floor(raw.length / WAVE_BARS))
        const out = new Array(WAVE_BARS)
        let globalMax = 0
        for (let i = 0; i < WAVE_BARS; i++) {
          let max = 0
          const s = i * block
          const e = Math.min(raw.length, s + block)
          for (let j = s; j < e; j++) {
            const v = Math.abs(raw[j])
            if (v > max) max = v
          }
          out[i] = max
          if (max > globalMax) globalMax = max
        }
        const norm = globalMax || 1
        setPeaks(out.map((v) => v / norm))
      } catch {
        if (!cancelled) setPeaks(null) // playback still works without the waveform
      }
    })()
    return () => {
      cancelled = true
    }
  }, [audioSrc, duration])

  // Paint the waveform whenever peaks or the strip width (zoom) change.
  useEffect(() => {
    const c = waveCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    if (!peaks || !peaks.length) return
    const w = c.width
    const h = c.height
    const mid = h / 2
    const bw = w / peaks.length
    ctx.fillStyle = 'rgba(129, 140, 248, 0.55)' // indigo-400
    for (let i = 0; i < peaks.length; i++) {
      const bh = Math.max(1, peaks[i] * h * 0.92)
      ctx.fillRect(i * bw, mid - bh / 2, Math.max(1, bw * 0.8), bh)
    }
  }, [peaks, totalW])

  // ---- image-block editing ---------------------------------------------------
  function updatePlacement(id, patch) {
    onChange(placements.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  function removePlacement(id) {
    onChange(placements.filter((p) => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // Replay the CSS slide-in illustration: snap to the off-screen offset, then
  // (two rAFs later, so the browser actually paints the snap first) transition
  // back to rest — this is purely a visual mock, decoupled from the real ffmpeg
  // overlay animation, since ffmpeg output can't be rendered here.
  function previewAnimation() {
    setStagePos('off')
    requestAnimationFrame(() => requestAnimationFrame(() => setStagePos('on')))
  }

  // Play the Ken Burns motion once (progress 0 -> 1) so the user can SEE the
  // zoom/pan without rendering. Decoupled from the audio playhead — a quick
  // ~2.5s sweep — but uses the exact same kenBurnsTransform() as the render.
  function previewKenBurns(seconds = 2.5) {
    cancelAnimationFrame(kbRaf.current)
    const dur = Math.max(0.4, seconds) * 1000
    const start = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur)
      setKbProg(p)
      if (p < 1) kbRaf.current = requestAnimationFrame(step)
    }
    kbRaf.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(kbRaf.current), [])

  function playSoundPreview(soundId) {
    if (!soundId) return
    if (!sfxPreviewRef.current) sfxPreviewRef.current = new Audio()
    const a = sfxPreviewRef.current
    a.src = soundAudioUrl(soundId)
    a.currentTime = 0
    a.play().catch(() => {})
  }

  // Empty-track pointer down with an image selected => start drawing a new block.
  function trackDown(e) {
    if (disabled || !selectedKey || !duration) return
    const s = pxToSec(e.clientX)
    drag.current = { type: 'create' }
    setDraft({ start: s, end: s })
    imgTrackRef.current.setPointerCapture(e.pointerId)
  }
  // Pointer down on a block body => select + start moving it (keep its length).
  function beginMove(e, p) {
    e.stopPropagation()
    if (disabled) return
    setSelectedId(p.id)
    drag.current = {
      type: 'move',
      id: p.id,
      grabSec: pxToSec(e.clientX),
      origStart: p.start,
      origEnd: p.end,
    }
    imgTrackRef.current.setPointerCapture(e.pointerId)
  }
  // Pointer down on an edge handle => trim that side (change in/out point).
  function beginResize(e, p, side) {
    e.stopPropagation()
    if (disabled) return
    setSelectedId(p.id)
    drag.current = { type: side === 'l' ? 'resize-l' : 'resize-r', id: p.id, origStart: p.start, origEnd: p.end }
    imgTrackRef.current.setPointerCapture(e.pointerId)
  }
  function trackMove(e) {
    const d = drag.current
    if (!d) return
    const s = pxToSec(e.clientX)
    if (d.type === 'create') {
      setDraft((prev) => ({ ...prev, end: s }))
    } else if (d.type === 'move') {
      const len = d.origEnd - d.origStart
      const ns = clamp(d.origStart + (s - d.grabSec), 0, duration - len)
      updatePlacement(d.id, { start: round2(ns), end: round2(ns + len) })
    } else if (d.type === 'resize-l') {
      updatePlacement(d.id, { start: round2(clamp(s, 0, d.origEnd - MIN_LEN)) })
    } else if (d.type === 'resize-r') {
      updatePlacement(d.id, { end: round2(clamp(s, d.origStart + MIN_LEN, duration)) })
    }
  }
  function trackUp() {
    const d = drag.current
    drag.current = null
    if (d?.type === 'create' && draft) {
      const a = Math.min(draft.start, draft.end)
      const b = Math.max(draft.start, draft.end)
      if (b - a >= MIN_LEN) {
        const id = nextId()
        onChange([
          ...placements,
          {
            id, image: selectedKey, start: round2(a), end: round2(b), x: 'center', y: 'upper',
            full_width: true, animation: 'top', animation_duration: 0.15, sound_id: 'whoosh_soft',
            image_fit: 'cover',
          },
        ])
        setSelectedId(id)
      }
    }
    setDraft(null)
  }

  const labelFor = (key) => uploads.find((u) => u.key === key)?.label ?? key
  const selected = placements.find((p) => p.id === selectedId) || null
  const tooMany = placements.length > MAX_STICKERS
  const tooShort = placements.filter((p) => p.end - p.start < MIN_SECONDS)
  const ticks = []
  if (duration) {
    const step = niceStep(pps)
    for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(+t.toFixed(3))
  }

  // ---- 9:16 live preview ----------------------------------------------------
  // Which placements are on screen at the playhead, and where they sit in the
  // TOP region. Mirrors stitch_video.py's _overlay_xy presets (left/center/right
  // x, upper/lower y, or full-width) as CSS percentages so the preview roughly
  // matches the final render. Positions are within the top region only.
  const activePlacements = placements.filter((p) => cursor >= p.start && cursor <= p.end)
  const previewStyle = (p) => {
    const MX = 6 // horizontal margin %
    const MY = 5 // vertical margin % (within the top region)
    const s = { position: 'absolute' }
    if (p.full_width) {
      // Full width COVERS the whole top region in the render (scale+crop, flush
      // at 0,0 — see stitch_video.py build_filter_complex), so the preview must
      // fill it edge-to-edge with object-cover, NOT a margin-inset contained
      // band. This is the fix for "preview images look misaligned vs the video".
      s.inset = 0
      s.width = '100%'
      s.height = '100%'
      s.objectFit = 'cover'
      if (KENBURNS.has(p.animation)) {
        // Drive the zoom/pan from the playhead so scrubbing shows the real
        // motion at the real moment. Progress = how far through its window.
        const prog = p.end > p.start ? clamp((cursor - p.start) / (p.end - p.start), 0, 1) : 0
        s.transform = kenBurnsTransform(p.animation, prog)
        s.transformOrigin = 'center center'
      }
    } else {
      // Fixed-width sticker: 260px of the 1080px frame ~= 24%, aspect preserved.
      s.width = '24%'
      s.objectFit = 'contain'
      if (p.x === 'left') s.left = `${MX}%`
      else if (p.x === 'right') s.right = `${MX}%`
      else {
        s.left = '50%'
        s.transform = 'translateX(-50%)'
      }
      if (p.y === 'lower') s.bottom = `${MY}%`
      else s.top = `${MY}%`
    }
    return s
  }
  const bgHex = background === 'white' ? '#ffffff' : '#000000'

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 space-y-3 lg:flex-1">
      <label className="block text-sm font-medium text-slate-200">
        Image timeline{' '}
        {duration ? <span className="text-slate-500">({duration.toFixed(1)}s)</span> : null}
      </label>

      {/* --- upload dropzone --- */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!disabled) handleFiles(e.dataTransfer.files)
        }}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={
          'cursor-pointer rounded-lg border border-dashed p-3 text-center text-xs ' +
          (dragOver
            ? 'border-indigo-400 bg-indigo-500/10 text-indigo-200'
            : 'border-slate-700 text-slate-400 hover:border-slate-500')
        }
      >
        Drag & drop images here, or click to choose files
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = '' // allow re-selecting the same file
          }}
        />
      </div>

      {/* --- uploaded grid: pick one to place --- */}
      {uploads.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {uploads.map((u) => (
            <div key={u.key} className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setSelectedKey(u.key)}
                title={u.label}
                className={
                  'aspect-square w-full overflow-hidden rounded border bg-slate-800 ' +
                  (selectedKey === u.key
                    ? 'border-indigo-500 ring-1 ring-indigo-500'
                    : 'border-slate-700 hover:border-slate-500')
                }
              >
                <img src={u.url} alt={u.label} className="h-full w-full object-contain" />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveUpload(u.key)}
                title="Remove"
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full
                           bg-rose-600 text-[10px] leading-none text-white hover:bg-rose-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* --- timeline is locked until we know the real duration --- */}
      {!duration ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={onLoadTimeline}
            disabled={disabled || loading}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200
                       hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Measuring narration…' : 'Load timeline (generate voice preview)'}
          </button>
          <p className="text-xs text-slate-500">
            We synthesize the voice once to get the exact timing, then you can see what's said
            when and place images against real seconds.
          </p>
        </div>
      ) : (
        <>
          {/* transport + hint + zoom */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!audioSrc}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white
                         hover:bg-indigo-500 disabled:opacity-40"
              title={playing ? 'Pause' : 'Play narration'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <span className="font-mono text-xs text-slate-400">
              {fmtClock(cursor)} / {fmtClock(duration)}
            </span>
            <span className="flex-1 text-right text-[11px] text-slate-500">
              {selectedKey
                ? `Drag across the track to place "${labelFor(selectedKey)}".`
                : uploads.length
                  ? 'Pick an image above, then drag across the track.'
                  : 'Upload an image to start placing.'}
            </span>
            <div className="flex items-center gap-1 text-slate-400">
              <button
                type="button"
                onClick={() => setPps((p) => clamp(Math.round(p / 1.3), MIN_PPS, MAX_PPS))}
                className="h-6 w-6 rounded border border-slate-700 text-xs hover:bg-slate-800"
                title="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setPps((p) => clamp(Math.round(p * 1.3), MIN_PPS, MAX_PPS))}
                className="h-6 w-6 rounded border border-slate-700 text-xs hover:bg-slate-800"
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>

          {/* the hidden audio element that actually plays the narration */}
          {audioSrc && (
            <audio
              ref={audioRef}
              src={audioSrc}
              preload="auto"
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          )}

          {/* horizontally-scrollable timeline */}
          <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900">
            <div ref={contentRef} style={{ width: totalW }} className="relative select-none">
              {/* voice strip: ruler + waveform + words; drag it to scrub */}
              <div
                onPointerDown={scrubDown}
                onPointerMove={scrubMove}
                onPointerUp={scrubUp}
                className="cursor-pointer"
              >
                {/* ruler */}
                <div className="relative border-b border-slate-800" style={{ height: RULER_H }}>
                  {ticks.map((t) => (
                    <div
                      key={t}
                      className="absolute top-0 h-full border-l border-slate-700/70"
                      style={{ left: secToPx(t) }}
                    >
                      <span className="ml-1 text-[9px] text-slate-500">{fmtTick(t)}</span>
                    </div>
                  ))}
                </div>

                {/* waveform + word chips */}
                <div className="relative bg-slate-900/60" style={{ height: WAVE_H }}>
                  <canvas
                    ref={waveCanvasRef}
                    width={totalW}
                    height={WAVE_H}
                    className="absolute inset-0 h-full w-full"
                  />
                  {words.map((w, i) => (
                    <button
                      key={i}
                      type="button"
                      title={`${w.word} · ${w.start.toFixed(2)}–${w.end.toFixed(2)}s`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        seekTo(w.start)
                      }}
                      style={{
                        left: secToPx(w.start),
                        width: Math.max(secToPx(w.end - w.start), 5),
                      }}
                      className="absolute bottom-0 truncate rounded-t bg-slate-800/70 px-0.5 text-[9px]
                                 leading-4 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {w.word}
                    </button>
                  ))}
                </div>
              </div>

              {/* image track: create / move / trim blocks here */}
              <div
                ref={imgTrackRef}
                onPointerDown={trackDown}
                onPointerMove={trackMove}
                onPointerUp={trackUp}
                className={
                  'relative border-t border-slate-800 bg-slate-950/40 ' +
                  (selectedKey && !disabled ? 'cursor-crosshair' : '')
                }
                style={{ height: TRACK_H }}
              >
                {placements.map((p) => {
                  const active = p.id === selectedId
                  return (
                    <div
                      key={p.id}
                      onPointerDown={(e) => beginMove(e, p)}
                      style={{ left: secToPx(p.start), width: Math.max(secToPx(p.end - p.start), 6) }}
                      className={
                        'absolute top-1 bottom-1 flex items-center overflow-hidden rounded ' +
                        'text-[10px] text-white ' +
                        (active ? 'bg-indigo-500 ring-2 ring-white/70' : 'bg-indigo-600/85 hover:bg-indigo-600') +
                        (disabled ? '' : ' cursor-grab active:cursor-grabbing')
                      }
                      title={`${labelFor(p.image)} · ${p.start}–${p.end}s @ ${p.y}-${p.x}`}
                    >
                      {/* left trim handle */}
                      <div
                        onPointerDown={(e) => beginResize(e, p, 'l')}
                        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                      />
                      <span className="pointer-events-none w-full truncate px-2">{labelFor(p.image)}</span>
                      {/* right trim handle */}
                      <div
                        onPointerDown={(e) => beginResize(e, p, 'r')}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                      />
                    </div>
                  )
                })}
                {draft && (
                  <div
                    style={{
                      left: secToPx(Math.min(draft.start, draft.end)),
                      width: secToPx(Math.abs(draft.end - draft.start)),
                    }}
                    className="absolute top-1 bottom-1 rounded bg-emerald-500/50"
                  />
                )}
              </div>

              {/* playhead spanning the whole stack (non-interactive) */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-rose-400"
                style={{ left: secToPx(cursor) }}
              >
                <div className="absolute -left-[3px] -top-0.5 h-1.5 w-1.5 rounded-full bg-rose-400" />
              </div>
            </div>
          </div>

          {/* editor for the selected block: timing, position, delete */}
          {selected && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-medium">{labelFor(selected.image)}</span>
                <button
                  type="button"
                  onClick={() => removePlacement(selected.id)}
                  className="rounded border border-rose-500/40 px-2 py-0.5 text-rose-300 hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <label className="flex items-center gap-1">
                  start
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={selected.end - MIN_LEN}
                    value={selected.start}
                    onChange={(e) =>
                      updatePlacement(selected.id, {
                        start: round2(clamp(+e.target.value, 0, selected.end - MIN_LEN)),
                      })
                    }
                    className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-200"
                  />
                </label>
                <label className="flex items-center gap-1">
                  end
                  <input
                    type="number"
                    step="0.1"
                    min={selected.start + MIN_LEN}
                    max={duration}
                    value={selected.end}
                    onChange={(e) =>
                      updatePlacement(selected.id, {
                        end: round2(clamp(+e.target.value, selected.start + MIN_LEN, duration)),
                      })
                    }
                    className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-200"
                  />
                </label>
                <span className="text-slate-500">= {(selected.end - selected.start).toFixed(1)}s on screen</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {Y_OPTS.map((y) =>
                  X_OPTS.map((x) => {
                    const on = selected.x === x && selected.y === y
                    return (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        onClick={() => updatePlacement(selected.id, { x, y })}
                        className={
                          'rounded px-1 py-1 text-[10px] ' +
                          (on ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                        }
                      >
                        {y}-{x}
                      </button>
                    )
                  }),
                )}
              </div>

              {/* full width toggle — spans the whole top-region width, ignores x */}
              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={selected.full_width}
                  onChange={(e) => {
                    const full_width = e.target.checked
                    const patch = { full_width }
                    // Left/right slide-in doesn't make sense at full width.
                    if (full_width && (selected.animation === 'left' || selected.animation === 'right')) {
                      patch.animation = 'none'
                    }
                    // Ken Burns (zoom/pan) needs full width; drop it if turning off.
                    if (!full_width && KENBURNS.has(selected.animation)) {
                      patch.animation = 'none'
                    }
                    updatePlacement(selected.id, patch)
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-indigo-600
                             focus:ring-1 focus:ring-indigo-500"
                />
                Full width (spans the whole top region)
              </label>

              {/* slide-in animation direction */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">Slide in from</div>
                <div className="flex flex-wrap gap-1">
                  {ANIM_OPTS.map((a) => {
                    const disabledOpt = selected.full_width && (a.id === 'left' || a.id === 'right')
                    const on = selected.animation === a.id
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={disabledOpt}
                        onClick={() => updatePlacement(selected.id, { animation: a.id })}
                        className={
                          'rounded px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-30 ' +
                          (on ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                        }
                      >
                        {a.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ken Burns motion effect (zoom/pan) — full width only, since it
                  fills the whole top region. Mutually exclusive with slide-in:
                  both write `animation`, so at most one button is ever active. */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">
                  Motion effect{' '}
                  {!selected.full_width && (
                    <span className="text-slate-600">(turn on full width to use)</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {EFFECT_OPTS.map((e) => {
                    const on = selected.animation === e.id
                    return (
                      <button
                        key={e.id}
                        type="button"
                        disabled={!selected.full_width}
                        onClick={() =>
                          updatePlacement(selected.id, { animation: on ? 'none' : e.id })
                        }
                        className={
                          'rounded px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-30 ' +
                          (on ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                        }
                      >
                        {e.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Full-size fit mode — full width only. "cover" (default) fills the
                  region and crops overflow; "contain" fits the whole image with
                  no crop, padding letterbox borders with a blurred copy of it. */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">
                  Fit{' '}
                  {!selected.full_width && (
                    <span className="text-slate-600">(turn on full width to use)</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: 'cover', label: 'Cover (crop to fill)' },
                    { id: 'contain', label: 'Contain (no crop)' },
                  ].map((f) => {
                    const on = (selected.image_fit ?? 'cover') === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!selected.full_width}
                        onClick={() => updatePlacement(selected.id, { image_fit: f.id })}
                        className={
                          'rounded px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-30 ' +
                          (on ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                        }
                      >
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* slide-in speed + CSS-only preview (illustrative, not the real render) */}
              {['top', 'bottom', 'left', 'right'].includes(selected.animation) && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-[11px] text-slate-400">
                    speed
                    <input
                      type="range"
                      min={0.1}
                      max={1.5}
                      step={0.05}
                      value={selected.animation_duration}
                      onChange={(e) =>
                        updatePlacement(selected.id, { animation_duration: +e.target.value })
                      }
                      className="w-20 accent-indigo-500"
                    />
                    <span className="font-mono text-indigo-300">{selected.animation_duration.toFixed(2)}s</span>
                  </label>
                  <button
                    type="button"
                    onClick={previewAnimation}
                    className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                  >
                    ▶ Preview
                  </button>
                  <div className="relative h-10 w-16 overflow-hidden rounded border border-slate-700 bg-slate-950">
                    <div
                      style={{
                        transform: stagePos === 'off' ? ANIM_OFFSET[selected.animation] : 'translate(0, 0)',
                        transitionProperty: 'transform',
                        transitionDuration: `${selected.animation_duration}s`,
                        transitionTimingFunction: 'ease-out',
                      }}
                      className="absolute inset-1 rounded bg-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Ken Burns motion preview: the ACTUAL selected image, moving with
                  the same transform the render uses. Scrubbing the strip also
                  shows this in the big 9:16 panel; this button plays it on demand. */}
              {KENBURNS.has(selected.animation) && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      previewKenBurns(Math.min(2.5, Math.max(0.6, selected.end - selected.start)))
                    }
                    className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10"
                  >
                    ▶ Preview motion
                  </button>
                  <div className="relative aspect-27/32 h-14 overflow-hidden rounded border border-slate-700 bg-slate-950">
                    <img
                      src={uploads.find((u) => u.key === selected.image)?.url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{
                        transform: kenBurnsTransform(selected.animation, kbProg),
                        transformOrigin: 'center center',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Moves the whole {(selected.end - selected.start).toFixed(1)}s it's on screen
                  </span>
                </div>
              )}

              {/* sound effect played when this sticker slides in */}
              <div className="flex items-center gap-2">
                <select
                  value={selected.sound_id ?? ''}
                  onChange={(e) => updatePlacement(selected.id, { sound_id: e.target.value || null })}
                  className="flex-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-200"
                >
                  <option value="">No sound</option>
                  {sounds.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selected.sound_id}
                  onClick={() => playSoundPreview(selected.sound_id)}
                  title="Preview sound"
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200
                             hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
            </div>
          )}
        </>
      )}

        {/* --- soft quality warnings (don't block generation) --- */}
        {(tooMany || tooShort.length > 0) && (
          <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            {tooMany && (
              <div>⚠ {placements.length} images — consider keeping it ≤ {MAX_STICKERS} for a clean look.</div>
            )}
            {tooShort.length > 0 && (
              <div>⚠ {tooShort.length} image(s) shorter than {MIN_SECONDS}s may flash by too fast.</div>
            )}
          </div>
        )}
      </div>

      {/* ---- right: live 9:16 preview (shows images at the playhead) ---- */}
      <div className="lg:w-60 lg:shrink-0">
        <div className="lg:sticky lg:top-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-200">Preview</span>
            <span className="font-mono text-[10px] text-slate-500">{fmtClock(cursor)}</span>
          </div>
          <div className="mx-auto w-40 overflow-hidden rounded-lg border border-slate-700 lg:w-full">
            {/* 9:16 frame: top region (captions bg) + bottom gameplay slot */}
            <div className="relative aspect-9/16 w-full bg-slate-950">
              {/* top region */}
              <div
                className="absolute inset-x-0 top-0 overflow-hidden"
                style={{ height: `${topFrac * 100}%`, background: bgHex }}
              >
                {activePlacements.map((p) => (
                  <img
                    key={p.id}
                    src={uploads.find((u) => u.key === p.image)?.url}
                    alt=""
                    style={previewStyle(p)}
                    className="pointer-events-none rounded-sm"
                  />
                ))}
                {duration && activePlacements.length === 0 && (
                  <div className="flex h-full items-center justify-center px-2 text-center text-[9px] text-slate-500/70">
                    captions area
                  </div>
                )}
              </div>
              {/* bottom gameplay slot */}
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center
                           bg-linear-to-b from-slate-800 to-slate-900 text-[9px] text-slate-500"
                style={{ height: `${(1 - topFrac) * 100}%` }}
              >
                gameplay clip
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Play or scrub the strip — images pop in at their timestamps here, positioned like the final video.
          </p>
        </div>
      </div>
    </div>
  )
}
