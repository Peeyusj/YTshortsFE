// Canvas / aspect-ratio selector (Feature: 16:9 support). Options come from
// the backend (GET /api/canvases): "vertical" (9:16, Shorts/Reels) or
// "landscape" (16:9, regular YouTube). Landscape always renders full-screen
// server-side (no gameplay clip) regardless of the split selection — see
// backend/config.py's resolve_canvas_split().
export default function CanvasSelect({ canvases, value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <label htmlFor="canvas" className="block text-sm font-medium text-slate-200">
        Aspect ratio
      </label>
      <select
        id="canvas"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || canvases.length === 0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 focus:border-indigo-500 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {canvases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  )
}
