// Caption vertical-position picker (Feature: adjustable caption placement).
// Driven by GET /api/caption-positions (top/center/bottom by default) — a
// segmented control (like BackgroundToggle) rather than a dropdown, since
// there are only a handful of options and this is the kind of choice you
// want to see and click, not search.
export default function CaptionPositionSelect({ positions, value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-200">Caption position</label>
      <div className="grid grid-cols-3 gap-2">
        {positions.map((p) => {
          const selected = value === p.id
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p.id)}
              title={p.description}
              className={
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 text-sm ' +
                'transition disabled:cursor-not-allowed disabled:opacity-50 ' +
                (selected
                  ? 'border-indigo-500 ring-1 ring-indigo-500 text-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800')
              }
            >
              {/* Mini frame preview: a bar showing roughly where the caption sits. */}
              <span className="flex h-6 w-9 flex-col justify-between rounded border border-slate-600 bg-slate-950 p-0.5">
                <span className={`h-0.5 rounded-full ${p.id === 'top' ? 'bg-indigo-400' : 'bg-slate-700'}`} />
                <span className={`h-0.5 rounded-full ${p.id === 'center' ? 'bg-indigo-400' : 'bg-slate-700'}`} />
                <span className={`h-0.5 rounded-full ${p.id === 'bottom' ? 'bg-indigo-400' : 'bg-slate-700'}`} />
              </span>
              {p.label.replace(' (default)', '')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
