// Outro card picker. Three controls in one block:
//   1. an on/off checkbox (default on) for appending the end card at all,
//   2. WHICH card to append — thumbnails from GET /api/outros, filtered to the
//      cards whose artwork matches the selected canvas (a 9:16 card would sit
//      pillarboxed in a 16:9 render, so those simply aren't offered), and
//   3. how long it holds, from the backend's quick-pick durations.
// `available` comes from /api/health and reflects whether ANY card exists on the
// backend — if none do, the toggle still works but we note nothing will show.
import { useMemo } from 'react'
import { outroImageUrl } from '../api/client'

export default function OutroToggle({
  value,
  onChange,
  outros = [],
  canvas,
  outro,
  onOutroChange,
  seconds,
  onSecondsChange,
  secondsChoices = [],
  disabled,
  available,
}) {
  // Only cards made for the current aspect ratio ("any" fits every canvas).
  // Mirrors backend config.outro_cards_for(), which re-checks server-side.
  const cards = useMemo(
    () => outros.filter((c) => c.canvas === canvas || c.canvas === 'any'),
    [outros, canvas],
  )
  const selected = cards.find((c) => c.id === outro) ?? null

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600
                     focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        Show outro card
      </label>

      {value && available === false && (
        <p className="text-xs text-amber-300">
          &#9888; No outro images on the backend (assets/) &mdash; the outro will be skipped.
        </p>
      )}

      {value && cards.length === 0 && available !== false && (
        <p className="text-xs text-amber-300">
          &#9888; No outro card fits this aspect ratio &mdash; the outro will be skipped.
        </p>
      )}

      {value && cards.length > 0 && (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          {/* --- which card --- */}
          <div className="grid grid-cols-3 gap-2">
            {cards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOutroChange(c.id)}
                disabled={disabled}
                title={c.description}
                className={`overflow-hidden rounded-lg border bg-slate-950 p-1 transition
                            disabled:cursor-not-allowed disabled:opacity-50 ${
                              c.id === outro
                                ? 'border-indigo-500 ring-1 ring-indigo-500'
                                : 'border-slate-700 hover:border-slate-500'
                            }`}
              >
                <img
                  src={outroImageUrl(c.id)}
                  alt={c.label}
                  className="h-20 w-full rounded object-contain"
                />
                <span className="mt-1 block truncate text-[11px] text-slate-300">
                  {c.label}
                </span>
              </button>
            ))}
          </div>
          {selected?.description && (
            <p className="text-xs text-slate-400">{selected.description}</p>
          )}

          {/* --- how long it holds --- */}
          <div className="space-y-1">
            <span className="block text-xs font-medium text-slate-300">Duration</span>
            <div className="flex flex-wrap gap-2">
              {secondsChoices.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSecondsChange(s)}
                  disabled={disabled}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition
                              disabled:cursor-not-allowed disabled:opacity-50 ${
                                s === seconds
                                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                              }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
