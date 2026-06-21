// Sticker timeline (Feature #3, manual placement — no AI matching yet).
//
// Flow:
//   1. The timeline needs the REAL audio length, so it stays locked until you
//      click "Load timeline" (App calls POST /api/probe to measure it).
//   2. Pick a sticker from the library grid.
//   3. Click-and-drag across the timeline to set its start/end range.
//   4. Click a placed block to set its position (left/center/right ×
//      upper/lower) or delete it.
//
// Placements are lifted to the parent via onChange as
//   { image, start, end, x, y }
// which is exactly the shape the backend + stitch_video.py expect.
import { useRef, useState } from 'react'
import { stickerUrl } from '../api/client'

const X_OPTS = ['left', 'center', 'right']
const Y_OPTS = ['upper', 'lower']
const MAX_STICKERS = 5 // soft guardrail
const MIN_SECONDS = 2 // soft guardrail

let _idCounter = 0
const nextId = () => `s${_idCounter++}`

export default function StickerTimeline({
  duration,
  loading,
  onLoadTimeline,
  library,
  placements,
  onChange,
  disabled,
}) {
  const trackRef = useRef(null)
  const [selectedImage, setSelectedImage] = useState(null) // from library
  const [selectedId, setSelectedId] = useState(null) // a placed block
  const [draft, setDraft] = useState(null) // { start, end } while dragging

  // --- timeline locked until we know the real duration --------------------
  if (!duration) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-200">Stickers</label>
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
          We synthesize the voice once to get the exact duration, then you can place stickers
          against real seconds.
        </p>
      </div>
    )
  }

  // pixel x -> seconds, clamped to [0, duration]
  function pxToSec(clientX) {
    const rect = trackRef.current.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return frac * duration
  }

  function onPointerDown(e) {
    if (disabled || !selectedImage) return
    e.target.setPointerCapture?.(e.pointerId)
    const s = pxToSec(e.clientX)
    setDraft({ start: s, end: s })
  }
  function onPointerMove(e) {
    if (!draft) return
    setDraft((d) => ({ ...d, end: pxToSec(e.clientX) }))
  }
  function onPointerUp() {
    if (!draft) return
    const a = Math.min(draft.start, draft.end)
    const b = Math.max(draft.start, draft.end)
    setDraft(null)
    if (b - a < 0.3) return // ignore stray clicks / micro-drags
    const id = nextId()
    onChange([
      ...placements,
      { id, image: selectedImage, start: +a.toFixed(2), end: +b.toFixed(2), x: 'center', y: 'upper' },
    ])
    setSelectedId(id)
  }

  function updatePlacement(id, patch) {
    onChange(placements.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  function removePlacement(id) {
    onChange(placements.filter((p) => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const selected = placements.find((p) => p.id === selectedId) || null
  const tooMany = placements.length > MAX_STICKERS
  const tooShort = placements.filter((p) => p.end - p.start < MIN_SECONDS)
  const pct = (sec) => `${(sec / duration) * 100}%`

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-200">
        Stickers <span className="text-slate-500">({duration.toFixed(1)}s)</span>
      </label>

      {/* --- library grid: pick one, then drag on the timeline --- */}
      {library.length === 0 ? (
        <p className="text-xs text-slate-500">
          No stickers found. Drop images into <code>assets/stickers/</code> on the backend.
        </p>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          {library.map((s) => (
            <button
              key={s.image}
              type="button"
              disabled={disabled}
              onClick={() => setSelectedImage(s.image)}
              title={s.label}
              className={
                'aspect-square overflow-hidden rounded border bg-slate-800 ' +
                (selectedImage === s.image
                  ? 'border-indigo-500 ring-1 ring-indigo-500'
                  : 'border-slate-700 hover:border-slate-500')
              }
            >
              <img src={stickerUrl(s)} alt={s.label} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        {selectedImage
          ? `Drag across the timeline to place "${selectedImage}".`
          : 'Pick a sticker above, then drag across the timeline.'}
      </p>

      {/* --- the timeline track --- */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={
          'relative h-14 w-full select-none rounded-lg border border-slate-700 bg-slate-900 ' +
          (selectedImage && !disabled ? 'cursor-crosshair' : 'cursor-not-allowed')
        }
      >
        {/* placed blocks */}
        {placements.map((p) => (
          <div
            key={p.id}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedId(p.id)
            }}
            style={{ left: pct(p.start), width: pct(p.end - p.start) }}
            className={
              'absolute top-1 bottom-1 flex items-center justify-center overflow-hidden rounded ' +
              'px-1 text-[10px] text-white ' +
              (p.id === selectedId ? 'bg-indigo-500 ring-2 ring-white/60' : 'bg-indigo-600/80')
            }
            title={`${p.image} ${p.start}–${p.end}s @ ${p.x}/${p.y}`}
          >
            {p.image.replace(/\.[^.]+$/, '')}
          </div>
        ))}
        {/* live drag preview */}
        {draft && (
          <div
            style={{
              left: pct(Math.min(draft.start, draft.end)),
              width: pct(Math.abs(draft.end - draft.start)),
            }}
            className="absolute top-1 bottom-1 rounded bg-emerald-500/50"
          />
        )}
      </div>

      {/* --- editor for the selected placement --- */}
      {selected && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-medium">
              {selected.image} · {selected.start}–{selected.end}s
            </span>
            <button
              type="button"
              onClick={() => removePlacement(selected.id)}
              className="rounded border border-rose-500/40 px-2 py-0.5 text-rose-300 hover:bg-rose-500/10"
            >
              Delete
            </button>
          </div>
          {/* 3×2 position grid within the TOP region */}
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
                      (on
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                    }
                  >
                    {y}-{x}
                  </button>
                )
              }),
            )}
          </div>
        </div>
      )}

      {/* --- soft quality warnings (don't block generation) --- */}
      {(tooMany || tooShort.length > 0) && (
        <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          {tooMany && <div>⚠ {placements.length} stickers — consider keeping it ≤ {MAX_STICKERS} for a clean look.</div>}
          {tooShort.length > 0 && (
            <div>⚠ {tooShort.length} sticker(s) shorter than {MIN_SECONDS}s may flash by too fast.</div>
          )}
        </div>
      )}
    </div>
  )
}
