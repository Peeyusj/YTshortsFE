// Split / aspect selector (Feature #5). Options come from the backend
// (GET /api/splits); each carries top/bottom pixel heights. The little preview
// bar shows the caption-vs-clip proportion so the choice is visual, not numeric.
export default function SplitSelect({ splits, value, onChange, disabled }) {
  const active = splits.find((s) => s.id === value)
  const topPct = active ? (active.top / 1920) * 100 : 66.7

  return (
    <div className="space-y-2">
      <label htmlFor="split" className="block text-sm font-medium text-slate-200">
        Split (top captions / bottom clip)
      </label>
      <select
        id="split"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || splits.length === 0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {splits.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Proportion preview: top = caption region, bottom = gameplay region. */}
      <div className="flex h-10 w-16 flex-col overflow-hidden rounded border border-slate-700">
        <div
          className="flex items-center justify-center bg-slate-700 text-[8px] text-slate-300"
          style={{ height: `${topPct}%` }}
        >
          Aa
        </div>
        <div
          className="flex items-center justify-center bg-indigo-600/60 text-[8px] text-slate-100"
          style={{ height: `${100 - topPct}%` }}
        >
          clip
        </div>
      </div>
    </div>
  )
}
