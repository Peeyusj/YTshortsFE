// Voice dropdown. Options come from the backend (GET /api/voices), so adding a
// voice server-side automatically appears here — no frontend change.
export default function VoiceSelect({ voices, value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <label htmlFor="voice" className="block text-sm font-medium text-slate-200">
        Voice
      </label>
      <select
        id="voice"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || voices.length === 0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  )
}
