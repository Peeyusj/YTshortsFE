// AutoImageGenerator.jsx
// ----------------------
// Optional "let AI make the scene images" panel (docs/12-AI-IMAGE-GENERATION.md).
//
//   * A toggle. OFF = the manual image-upload flow is untouched (this panel
//     collapses to just the switch). ON = reveals the style + count + generate
//     controls.
//   * On "Generate images", POSTs the script + real narration duration to the
//     backend, polls, and on completion hands the finished images up to App via
//     onImagesReady() — which drops them onto the timeline at the LLM's suggested
//     times for the user to review/adjust.
//
// The images are made on a free Colab GPU, so this is slow and fully skippable —
// exactly the point of the toggle.

import { useEffect, useRef, useState } from 'react'
import { sceneImageUrl, suggestImageCount } from '../api/client'
import { useSceneImages } from '../hooks/useSceneImages'

export default function AutoImageGenerator({
  enabled,
  onToggle,
  styles,
  style,
  onStyleChange,
  count,
  onCountChange,
  minCount = 1,
  maxCount = 30,
  text,
  duration, // real narration length in seconds (null until the timeline is loaded)
  words = [], // real per-word timestamps from /api/probe — anchors image timing to
  // the actual narration instead of an LLM-guessed proportional split
  split, // current split id (Feature: Full-size image mode) — sets the image request aspect
  canvas, // current canvas id (Feature: 16:9 support) — sets the image request aspect
  disabled, // true while a render job is running
  onImagesReady,
}) {
  const { phase, job, error, isBusy, start, reset } = useSceneImages()
  const selectedStyle = styles.find((s) => s.id === style) ?? null

  // AI count suggestion: a SEPARATE, explicit step from the count field itself —
  // the user must see the number and press "Use N" before it overwrites their
  // count, rather than it silently pre-filling on their behalf.
  const [suggestion, setSuggestion] = useState(null) // { count, min, max } once fetched
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState(null)

  async function handleSuggestCount() {
    setSuggesting(true)
    setSuggestError(null)
    setSuggestion(null)
    try {
      const hasDur = typeof duration === 'number' && duration > 0
      const res = await suggestImageCount({ text, duration: hasDur ? duration : null })
      setSuggestion(res)
    } catch (err) {
      setSuggestError(err.message)
    } finally {
      setSuggesting(false)
    }
  }

  function acceptSuggestion() {
    if (!suggestion) return
    onCountChange(suggestion.count)
    setSuggestion(null)
  }

  // Optional reference image (session-only, lives entirely in this panel):
  // { file, url } or null. When set, the whole batch takes inspiration from it.
  const [refImage, setRefImage] = useState(null)
  function pickReference(file) {
    if (!file) return
    setRefImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
  }
  function clearReference() {
    setRefImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  // When a batch finishes, map the scenes into the timeline's image shape and
  // hand them up. Each key is the "generated:<jobId>/<file>" reference the
  // backend resolves at render time; url is fetchable for the preview.
  const lastDelivered = useRef(null)
  useEffect(() => {
    if (phase !== 'done' || !job?.id) return
    if (lastDelivered.current === job.id) return // deliver each batch once
    lastDelivered.current = job.id
    const images = (job.scenes ?? []).map((s) => ({
      key: `generated:${job.id}/${s.image}`,
      label: s.prompt ? s.prompt.slice(0, 48) : s.image,
      url: sceneImageUrl(job.id, s.image),
      start: s.start,
      end: s.end,
    }))
    if (images.length) onImagesReady(images)
  }, [phase, job, onImagesReady])

  const hasDuration = typeof duration === 'number' && duration > 0
  const canGenerate = enabled && !disabled && !isBusy && text.trim().length > 0 && hasDuration

  function handleGenerate() {
    start({ text, duration, style, count, split, canvas, words, referenceFile: refImage?.file ?? null })
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      {/* Toggle row */}
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-200">
          Auto-generate scene images
          <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-normal text-indigo-300">
            AI
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-indigo-500 disabled:opacity-50"
        />
      </label>

      {!enabled && (
        <p className="text-xs text-slate-500">
          Off — upload your own images below. Turn on to have AI create scene
          images from your script and place them on the timeline.
        </p>
      )}

      {enabled && (
        <div className="space-y-3">
          {/* Style */}
          <div className="space-y-1.5">
            <label htmlFor="image-style" className="block text-xs font-medium text-slate-300">
              Image style
            </label>
            <select
              id="image-style"
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              disabled={disabled || isBusy || styles.length === 0}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                         text-slate-100 focus:border-indigo-500 focus:outline-none
                         focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {selectedStyle?.description && (
              <p className="text-xs text-slate-500">{selectedStyle.description}</p>
            )}
          </div>

          {/* Count */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="image-count" className="block text-xs font-medium text-slate-300">
                How many images ({minCount}–{maxCount})
              </label>
              <button
                type="button"
                onClick={handleSuggestCount}
                disabled={disabled || isBusy || suggesting || text.trim().length === 0}
                className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300
                           disabled:cursor-not-allowed disabled:opacity-40"
              >
                {suggesting ? 'Asking AI…' : 'Suggest count from script'}
              </button>
            </div>
            <input
              id="image-count"
              type="number"
              min={minCount}
              max={maxCount}
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isNaN(n)) return
                onCountChange(Math.max(minCount, Math.min(maxCount, Math.round(n))))
              }}
              disabled={disabled || isBusy}
              className="w-24 rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                         text-slate-100 focus:border-indigo-500 focus:outline-none
                         focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />

            {/* Explicit two-step confirm: the suggestion is shown but NOT applied
                until the user presses "Use N" — it never silently overwrites
                whatever count they already had. */}
            {suggestError && (
              <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                Couldn't get a suggestion: {suggestError}
              </p>
            )}
            {suggestion && (
              <div className="flex items-center justify-between gap-2 rounded-lg border
                               border-fuchsia-500/40 bg-fuchsia-500/10 p-2">
                <p className="text-xs text-fuchsia-100">
                  AI suggests <span className="font-semibold">{suggestion.count}</span> image
                  {suggestion.count === 1 ? '' : 's'} for this script.
                </p>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={acceptSuggestion}
                    className="rounded bg-fuchsia-600 px-2 py-1 text-xs font-medium text-white
                               hover:bg-fuchsia-500"
                  >
                    Use {suggestion.count}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestion(null)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300
                               hover:bg-slate-800"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Optional reference image — the batch takes inspiration from it
              (subject/style). Fully skippable: leave empty for pure text-to-image. */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Reference image <span className="text-slate-500">(optional)</span>
            </label>
            {!refImage ? (
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border
                            border-dashed border-slate-700 bg-slate-900 p-3 text-xs text-slate-500
                            hover:border-slate-500 hover:text-slate-300
                            ${disabled || isBusy ? 'pointer-events-none opacity-50' : ''}`}
              >
                Drop / pick an image the AI should take inspiration from
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={disabled || isBusy}
                  onChange={(e) => {
                    pickReference(e.target.files?.[0])
                    e.target.value = '' // allow re-picking the same file later
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-2">
                <img
                  src={refImage.url}
                  alt="reference"
                  className="h-12 w-12 rounded object-cover"
                />
                <span className="flex-1 truncate text-xs text-slate-400">
                  {refImage.file.name}
                </span>
                <button
                  onClick={clearReference}
                  disabled={disabled || isBusy}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300
                             hover:bg-slate-800 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Load-timeline hint: scene timings need the real narration length. */}
          {!hasDuration && (
            <p className="text-xs text-amber-300/80">
              Load the timeline first (below) so the images can be timed to the
              narration.
            </p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full rounded-lg bg-fuchsia-600 py-2 text-sm font-medium text-white
                       transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isBusy ? 'Generating images…' : 'Generate images'}
          </button>

          {/* Progress */}
          {isBusy && (
            <div className="space-y-1 text-xs text-slate-400">
              <p>
                {job?.stage === 'planning'
                  ? 'Planning scenes with the LLM…'
                  : `Rendering images… ${job?.done ?? 0}/${job?.total ?? count}`}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-fuchsia-500 transition-all"
                  style={{
                    width:
                      job?.total > 0
                        ? `${Math.round((100 * (job?.done ?? 0)) / job.total)}%`
                        : '15%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Done / error */}
          {phase === 'done' && (
            <p className="text-xs text-emerald-400">
              Added {job?.scenes?.length ?? 0} image(s) to the timeline below —
              adjust their timing/position, then Generate the video.
            </p>
          )}
          {/* A "done" job can still carry a warning: the batch stopped short of
              the requested count (e.g. the free Colab GPU dropped mid-batch) but
              everything rendered before that point was kept and added above. */}
          {phase === 'done' && job?.error && (
            <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              {job.error}
            </p>
          )}
          {phase === 'error' && (
            <div className="space-y-2">
              <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                {error}
              </p>
              <button
                onClick={reset}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
