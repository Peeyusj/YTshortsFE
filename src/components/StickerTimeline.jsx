// Sticker timeline (Feature #3, manual placement — images uploaded per session).
//
// Flow:
//   1. Upload one or more images from your computer (drag-drop or file picker).
//      They live only in this browser session (no server library).
//   2. Click "Load timeline" — App calls POST /api/probe to measure the real
//      narration length so the timeline is in true seconds.
//   3. Pick an uploaded image, then click-and-drag across the timeline to set
//      its start/end range.
//   4. Click a placed block to set its position (left/center/right ×
//      upper/lower) or delete it.
//
// Uploads are owned by the parent (App) so it can send the actual File objects
// on Generate. This component receives them as `uploads` = [{ key, label, url }]
// and reports placements via onChange as { id, image, start, end, x, y } where
// `image` is the upload's unique `key`.
import { useRef, useState } from 'react'

const X_OPTS = ['left', 'center', 'right']
const Y_OPTS = ['upper', 'lower']
const MAX_STICKERS = 5 // soft guardrail
const MIN_SECONDS = 2 // soft guardrail

let _idCounter = 0
const nextId = () => `p${_idCounter++}`

export default function StickerTimeline({
  duration,
  loading,
  onLoadTimeline,
  uploads,
  onAddFiles,
  onRemoveUpload,
  placements,
  onChange,
  disabled,
}) {
  const trackRef = useRef(null)
  const fileInputRef = useRef(null)
  const [selectedKey, setSelectedKey] = useState(null) // upload chosen to place
  const [selectedId, setSelectedId] = useState(null) // placed block being edited
  const [draft, setDraft] = useState(null) // { start, end } while dragging
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(fileList) {
    const imgs = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (imgs.length) onAddFiles(imgs)
  }

  // pixel x -> seconds, clamped to [0, duration]
  function pxToSec(clientX) {
    const rect = trackRef.current.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return frac * duration
  }
  function onPointerDown(e) {
    if (disabled || !selectedKey) return
    e.target.setPointerCapture?.(e.pointerId)
    setDraft({ start: pxToSec(e.clientX), end: pxToSec(e.clientX) })
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
    if (b - a < 0.3) return // ignore stray clicks
    const id = nextId()
    onChange([
      ...placements,
      { id, image: selectedKey, start: +a.toFixed(2), end: +b.toFixed(2), x: 'center', y: 'upper' },
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

  const labelFor = (key) => uploads.find((u) => u.key === key)?.label ?? key
  const selected = placements.find((p) => p.id === selectedId) || null
  const tooMany = placements.length > MAX_STICKERS
  const tooShort = placements.filter((p) => p.end - p.start < MIN_SECONDS)
  const pct = (sec) => `${(sec / duration) * 100}%`

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-200">
        Stickers {duration ? <span className="text-slate-500">({duration.toFixed(1)}s)</span> : null}
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
          (dragOver ? 'border-indigo-400 bg-indigo-500/10 text-indigo-200' : 'border-slate-700 text-slate-400 hover:border-slate-500')
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

      {/* --- timeline locked until we know the real duration --- */}
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
            We synthesize the voice once to get the exact duration, then you can place stickers
            against real seconds.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {selectedKey
              ? `Drag across the timeline to place "${labelFor(selectedKey)}".`
              : uploads.length
                ? 'Pick an uploaded image above, then drag across the timeline.'
                : 'Upload an image first.'}
          </p>

          {/* the timeline track */}
          <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={
              'relative h-14 w-full select-none rounded-lg border border-slate-700 bg-slate-900 ' +
              (selectedKey && !disabled ? 'cursor-crosshair' : 'cursor-not-allowed')
            }
          >
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
                title={`${labelFor(p.image)} ${p.start}–${p.end}s @ ${p.x}/${p.y}`}
              >
                {labelFor(p.image)}
              </div>
            ))}
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

          {/* editor for the selected placement */}
          {selected && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-medium">
                  {labelFor(selected.image)} · {selected.start}–{selected.end}s
                </span>
                <button
                  type="button"
                  onClick={() => removePlacement(selected.id)}
                  className="rounded border border-rose-500/40 px-2 py-0.5 text-rose-300 hover:bg-rose-500/10"
                >
                  Delete
                </button>
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
            </div>
          )}
        </>
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
