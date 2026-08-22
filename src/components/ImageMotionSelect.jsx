// ImageMotionSelect.jsx
// ---------------------
// How the AI scene images behave: the handover from one image to the next, and
// how strong the Ken Burns move is. Driven by GET /api/motion.
//
// Both settings only affect FULL-WIDTH images (the ones that fill the top
// region — which is what auto-placed scene images are). A timeline of small
// fixed-width stickers is unaffected, which is why this sits with the image
// controls rather than in the general video settings.

export default function ImageMotionSelect({
  transitions,
  kenBurnsLevels,
  transition,
  transitionSeconds,
  kenBurns,
  bounds,
  onTransitionChange,
  onSecondsChange,
  onKenBurnsChange,
  disabled,
}) {
  const selectedTransition = transitions.find((t) => t.id === transition) ?? null
  const selectedKb = kenBurnsLevels.find((k) => k.id === kenBurns) ?? null
  // With no handover there is no length to set.
  const secondsDisabled = disabled || transition === 'none'

  const selectClass =
    'w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
    'disabled:opacity-50'

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor="image-transition" className="block text-sm font-medium text-slate-200">
          Image transition
        </label>
        <select
          id="image-transition"
          value={transition}
          onChange={(e) => onTransitionChange(e.target.value)}
          disabled={disabled || transitions.length === 0}
          className={selectClass}
        >
          {transitions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {selectedTransition?.description && (
          <p className="text-xs text-slate-400">{selectedTransition.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="transition-seconds" className="block text-sm font-medium text-slate-200">
          Handover length
          <span className="ml-2 font-normal text-slate-400">
            {transitionSeconds.toFixed(2)}s
          </span>
        </label>
        <input
          id="transition-seconds"
          type="range"
          min={bounds?.min ?? 0.1}
          max={bounds?.max ?? 1.5}
          step={0.05}
          value={transitionSeconds}
          onChange={(e) => onSecondsChange(Number(e.target.value))}
          disabled={secondsDisabled}
          className="w-full accent-indigo-500 disabled:opacity-40"
        />
        <p className="text-xs text-slate-500">
          Automatically shortened for images whose window is too brief to spare it,
          so a dense timeline stays snappy instead of being permanently mid-fade.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="ken-burns" className="block text-sm font-medium text-slate-200">
          Zoom strength
        </label>
        <select
          id="ken-burns"
          value={kenBurns}
          onChange={(e) => onKenBurnsChange(e.target.value)}
          disabled={disabled || kenBurnsLevels.length === 0}
          className={selectClass}
        >
          {kenBurnsLevels.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">
          {selectedKb && selectedKb.zoom > 1
            ? 'Each image gets a different move (zoom in, pan, zoom out) so a run of ' +
              'them never feels mechanical. A bigger zoom is more visible but softens ' +
              'the upscaled image.'
            : 'Images sit completely still.'}
        </p>
      </div>
    </div>
  )
}
