// Background-music picker. Driven by GET /api/music. Adding a track is a pure
// backend change (a file in assets/backgroundMusic/ + one line in config.MUSIC);
// this control renders whatever the registry returns, plus a "None" option so
// the narration can play dry.
//
// When a track is selected we surface its description/mood/artist (so you know
// what each bed is for — the "add its other description too" part) and reveal a
// volume slider that controls how loud the music sits UNDER the voice.
export default function MusicSelect({
  music,
  value,
  onChange,
  volume,
  onVolumeChange,
  disabled,
}) {
  const selected = music.find((m) => m.id === value) ?? null
  // Store/emit volume as a 0..1 float (matches the backend); show it as a %.
  const pct = Math.round(volume * 100)

  return (
    <div className="space-y-2">
      <label htmlFor="music" className="block text-sm font-medium text-slate-200">
        Background music
      </label>
      <select
        id="music"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {/* Empty value = no music. The backend treats null/"" as "no music". */}
        <option value="">None — narration only</option>
        {music.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {/* Description panel for the selected track — the "other description" the
          registry carries, shown so you can pick the right vibe at a glance. */}
      {selected && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-200">{selected.artist}</span>
            {selected.mood && (
              <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                {selected.mood}
              </span>
            )}
          </div>
          {selected.description && (
            <p className="mt-1 text-slate-400">{selected.description}</p>
          )}
        </div>
      )}

      {/* Volume slider only matters when a track is chosen. 0–100% maps to the
          0.0–1.0 the backend mixes at. Kept low by default so voice stays clear. */}
      {selected && (
        <div className="space-y-1 pt-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor="music-volume" className="text-xs font-medium text-slate-300">
              Music volume
            </label>
            <span className="text-xs font-mono text-indigo-300">{pct}%</span>
          </div>
          <input
            id="music-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => onVolumeChange(parseInt(e.target.value, 10) / 100)}
            disabled={disabled}
            className="w-full accent-indigo-500 disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Subtle</span>
            <span>As loud as voice</span>
          </div>
        </div>
      )}
    </div>
  )
}
