// Speed control: a 1.0×–2.0× slider in 0.1 steps. We send the raw multiplier to
// the backend; it converts to edge_tts's '+N%' rate format. The frontend never
// deals with that format — clean separation.
export default function SpeedSlider({ value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="speed" className="text-sm font-medium text-slate-200">
          Speed
        </label>
        <span className="text-xs font-mono text-indigo-300">{value.toFixed(1)}×</span>
      </div>
      <input
        id="speed"
        type="range"
        min={1}
        max={2}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full accent-indigo-500 disabled:opacity-50"
      />
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>1.0× normal</span>
        <span>2.0× fast</span>
      </div>
    </div>
  )
}
