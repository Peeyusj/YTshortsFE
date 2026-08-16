// Character dropdown for AI scene-image generation. Options come from the
// persistent character library (GET /api/characters, held in App's
// `characters` state — see CharacterLibrary.jsx for create/delete). Picking
// "None" falls back to AutoImageGenerator's own one-off reference-image
// upload, exactly like before this feature existed.
import { characterImageUrl } from '../api/client'

export default function CharacterSelect({ characters, value, onChange, disabled }) {
  const selected = characters.find((c) => c.id === value) ?? null

  return (
    <div className="space-y-1.5">
      <label htmlFor="character" className="block text-xs font-medium text-slate-300">
        Character <span className="text-slate-500">(optional)</span>
      </label>
      <div className="flex items-center gap-2">
        {selected && (
          <img
            src={characterImageUrl(selected.id)}
            alt={selected.name}
            className="h-9 w-9 shrink-0 rounded object-cover"
          />
        )}
        <select
          id="character"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || characters.length === 0}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                     text-slate-100 focus:border-indigo-500 focus:outline-none
                     focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        >
          <option value="">
            {characters.length === 0 ? 'No saved characters yet' : 'None — use a one-off reference image'}
          </option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {selected?.description && (
        <p className="truncate text-xs text-slate-500" title={selected.description}>
          {selected.description}
        </p>
      )}
    </div>
  )
}
