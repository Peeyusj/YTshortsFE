// Subtitle on/off toggle. On by default (previous behaviour: captions were
// always burned in). Off skips the captions pipeline stage on the backend
// entirely, not just the burn-in.
export default function CaptionsToggle({ value, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      />
      Burn in subtitles
    </label>
  )
}
