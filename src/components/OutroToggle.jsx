// Outro toggle. A simple on/off checkbox (default on) for appending a 2-second
// outro card at the end of the video. `available` comes from /api/health and
// reflects whether the outro image (assets/outroImage.png) exists on the backend
// — if it doesn't, the toggle still works but we note it won't show anything.
export default function OutroToggle({ value, onChange, disabled, available }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600
                     focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        Show outro card (2s at the end)
      </label>
      {value && available === false && (
        <p className="text-xs text-amber-300">
          ⚠ No <code>assets/outroImage.png</code> on the backend — the outro will be skipped.
        </p>
      )}
    </div>
  )
}
