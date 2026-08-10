// IntroOutroVideo — two independent "drop a short full-screen clip" slots.
//
// You can add an INTRO clip (plays before the short) and/or an OUTRO clip
// (plays after), each with its OWN audio. The backend concatenates them around
// the finished short and caps each at 5 seconds. Clips live only in this browser
// session (like the sticker images); the actual File is sent on Generate.
//
// Each slot is owned by the parent (App): it holds { key, name, file, url } or
// null and updates via onChange(slot, value). `key` is the filename the backend
// saves the upload under and the `intro_video`/`outro_video` payload references.

const MAX_SECONDS = 5

function Slot({ label, hint, value, onPick, onClear, disabled }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-[10px] text-slate-500">≤ {MAX_SECONDS}s · full screen</span>
      </div>

      {value ? (
        <div className="space-y-2">
          <video
            src={value.url}
            controls
            muted
            className="max-h-40 w-full rounded bg-black object-contain"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-slate-400" title={value.name}>
              {value.name}
            </span>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="shrink-0 rounded border border-rose-500/40 px-2 py-0.5 text-[11px]
                         text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          className={
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border ' +
            'border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-400 ' +
            'hover:border-slate-500 ' +
            (disabled ? 'pointer-events-none opacity-50' : '')
          }
        >
          {hint}
          <input
            type="file"
            accept="video/*"
            hidden
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = '' // allow re-selecting the same file
            }}
          />
        </label>
      )}
    </div>
  )
}

export default function IntroOutroVideo({
  intro,
  outro,
  onPickIntro,
  onPickOutro,
  onClearIntro,
  onClearOutro,
  disabled,
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-200">Intro / outro video</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Slot
          label="Intro"
          hint="Drop a clip to play BEFORE the short"
          value={intro}
          onPick={onPickIntro}
          onClear={onClearIntro}
          disabled={disabled}
        />
        <Slot
          label="Outro"
          hint="Drop a clip to play AFTER the short"
          value={outro}
          onPick={onPickOutro}
          onClear={onClearOutro}
          disabled={disabled}
        />
      </div>
      <p className="text-[11px] text-slate-500">
        Each clip keeps its own audio and is trimmed to {MAX_SECONDS}s. Longer drops are cut to fit.
      </p>
    </div>
  )
}
