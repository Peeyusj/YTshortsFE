// CaptionAnimationSelect.jsx
// --------------------------
// Word-pop captions: how the spoken word is marked, in what colour, and how many
// words share a line. Driven entirely by GET /api/caption-animations, so adding
// a mode or a highlight colour is a backend config edit with no change here.
//
// The animation and density controls are independent on purpose. Density is the
// bigger visual change of the two — it decides how much text is on screen at
// once — and it's useful even with the animation off.

export default function CaptionAnimationSelect({
  animations,
  highlights,
  densities,
  animation,
  highlight,
  density,
  onAnimationChange,
  onHighlightChange,
  onDensityChange,
  disabled,
}) {
  const selectedAnimation = animations.find((a) => a.id === animation) ?? null
  const selectedDensity = densities.find((d) => d.id === density) ?? null
  // The colour only does anything once a word is being singled out.
  const highlightDisabled = disabled || animation === 'off'

  const selectClass =
    'w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
    'disabled:opacity-50'

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor="caption-animation" className="block text-sm font-medium text-slate-200">
          Word highlight
        </label>
        <select
          id="caption-animation"
          value={animation}
          onChange={(e) => onAnimationChange(e.target.value)}
          disabled={disabled || animations.length === 0}
          className={selectClass}
        >
          {animations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        {selectedAnimation?.description && (
          <p className="text-xs text-slate-400">{selectedAnimation.description}</p>
        )}
      </div>

      {/* Colour swatches rather than a dropdown — picking a colour from a list of
          colour NAMES is exactly the case where seeing them beats reading them. */}
      <div className="space-y-2">
        <span className="block text-sm font-medium text-slate-200">Highlight colour</span>
        <div className="flex flex-wrap gap-2">
          {highlights.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onHighlightChange(h.id)}
              disabled={highlightDisabled}
              title={h.label}
              aria-label={h.label}
              aria-pressed={highlight === h.id}
              className={`h-7 w-7 rounded-full border-2 transition disabled:opacity-40 ${
                highlight === h.id ? 'border-slate-100' : 'border-slate-700 hover:border-slate-500'
              }`}
              style={{ backgroundColor: h.css }}
            />
          ))}
        </div>
        {animation === 'off' && (
          <p className="text-xs text-slate-500">
            Turn on a word highlight to use a colour.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="caption-density" className="block text-sm font-medium text-slate-200">
          Words per line
        </label>
        <select
          id="caption-density"
          value={density}
          onChange={(e) => onDensityChange(e.target.value)}
          disabled={disabled || densities.length === 0}
          className={selectClass}
        >
          {densities.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {selectedDensity?.description && (
          <p className="text-xs text-slate-400">{selectedDensity.description}</p>
        )}
      </div>
    </div>
  )
}
