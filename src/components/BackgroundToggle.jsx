// Background toggle (Feature #2). A fixed two-value choice — black or white
// top region — so it's a simple segmented control rather than a backend-driven
// dropdown like Voice/Clip. Captions auto-pick a contrasting colour server-side,
// so the little swatch previews show the resulting text colour too.
const OPTIONS = [
  { value: 'black', label: 'Black', swatchBg: 'bg-black', swatchText: 'text-white' },
  { value: 'white', label: 'White', swatchBg: 'bg-white', swatchText: 'text-black' },
]

export default function BackgroundToggle({ value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-200">
        Top background
      </label>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={
                'flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm ' +
                'transition disabled:cursor-not-allowed disabled:opacity-50 ' +
                (selected
                  ? 'border-indigo-500 ring-1 ring-indigo-500 text-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800')
              }
            >
              {/* Swatch previews the background with sample contrasting text. */}
              <span
                className={`flex h-5 w-7 items-center justify-center rounded border border-slate-600 text-[10px] font-bold ${opt.swatchBg} ${opt.swatchText}`}
              >
                Aa
              </span>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
