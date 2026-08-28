// World dropdown for AI scene-image generation. Options come from the
// persistent world library (GET /api/worlds, held in App's `worlds` state —
// see WorldLibrary.jsx for create/delete). Picking "None" means no franchise
// grounding — the plain Image style picker applies, unchanged.
export default function WorldSelect({ worlds, value, onChange, disabled }) {
  const selected = worlds.find((w) => w.id === value) ?? null

  return (
    <div className="space-y-1.5">
      <label htmlFor="world" className="block text-xs font-medium text-slate-300">
        World <span className="text-slate-500">(optional)</span>
      </label>
      <select
        id="world"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || worlds.length === 0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        <option value="">
          {worlds.length === 0 ? 'No saved worlds yet' : 'None — plain image style'}
        </option>
        {worlds.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {selected?.setting_description && (
        <p className="truncate text-xs text-slate-500" title={selected.setting_description}>
          {selected.setting_description}
        </p>
      )}
    </div>
  )
}
