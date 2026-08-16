// Caption font/colour preset picker. Driven by GET /api/caption-styles.
// Mirrors MusicSelect's shape: dropdown + description panel, plus a live CSS
// text preview so you can see roughly what the style looks like before
// generating (the backend renders the real thing via libass/.ass — this is
// just a close-enough approximation using CSS text-stroke for the outline).

// Reverses the .ass &HAABBGGRR colour format to a CSS #RRGGBB string. Display
// only — the backend keeps consuming the &H.. format natively.
function assColorToCss(assHex) {
  if (!assHex) return null
  const hex = assHex.replace(/^&H/i, '').replace(/&$/, '')
  if (hex.length < 6) return null
  const bb = hex.slice(-6, -4)
  const gg = hex.slice(-4, -2)
  const rr = hex.slice(-2)
  return `#${rr}${gg}${bb}`
}

export default function CaptionStyleSelect({ styles, value, onChange, background, disabled }) {
  const selected = styles.find((s) => s.id === value) ?? null
  const previewColor =
    (selected && assColorToCss(selected.primary)) ?? (background === 'white' ? '#000000' : '#ffffff')
  const previewOutline =
    (selected && assColorToCss(selected.outline)) ?? (background === 'white' ? '#ffffff' : '#000000')

  return (
    <div className="space-y-2">
      <label htmlFor="caption-style" className="block text-sm font-medium text-slate-200">
        Caption style
      </label>
      <select
        id="caption-style"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || styles.length === 0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {styles.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      {selected && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
          {selected.description && <p className="text-slate-400">{selected.description}</p>}
          <div
            className="flex items-center justify-center rounded bg-slate-950 py-4 text-xl"
            style={{
              fontFamily: selected.font,
              fontWeight: selected.bold ? 900 : 400,
              // "Bold Box"-style presets (box: true) render a solid fill box
              // behind the text server-side (libass BorderStyle=3) instead of
              // an outline+shadow — approximate that here with a background
              // colour instead of a text-stroke, so the preview matches.
              ...(selected.box
                ? { color: previewColor, backgroundColor: previewOutline, borderRadius: 6 }
                : { color: previewColor, WebkitTextStroke: `1.5px ${previewOutline}` }),
            }}
          >
            Sample Caption
          </div>
        </div>
      )}
    </div>
  )
}
