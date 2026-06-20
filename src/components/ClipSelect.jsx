// Bottom gameplay-clip dropdown. Driven by GET /api/clips. Today there's only
// subway_surfer, but the selector exists from day one so adding clips later is
// purely a backend config change.
export default function ClipSelect({ clips, value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <label htmlFor="clip" className="block text-sm font-medium text-slate-200">
        Bottom video
      </label>
      <select
        id="clip"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || clips.length === 0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {clips.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  )
}
