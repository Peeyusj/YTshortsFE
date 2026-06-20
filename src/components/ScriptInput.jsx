import { countWords, estimateSeconds, MAX_SECONDS } from '../lib/estimate'

// The story/script textarea + live character count and a duration estimate that
// turns into a warning when the script is likely to exceed the 60s Shorts limit.
// `speed` is passed in so the estimate reflects the chosen narration speed.
export default function ScriptInput({ value, onChange, speed, disabled }) {
  const chars = value.length
  const words = countWords(value)
  const seconds = estimateSeconds(value, speed)
  const tooLong = seconds > MAX_SECONDS

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="script" className="text-sm font-medium text-slate-200">
          Story / script
        </label>
        <span className="text-xs text-slate-400">
          {chars} chars · {words} words
        </span>
      </div>

      <textarea
        id="script"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder="Paste or type your Hinglish story here…"
        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm
                   text-slate-100 placeholder:text-slate-500 focus:border-indigo-500
                   focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      />

      <div className="flex items-center justify-between text-xs">
        <span className={tooLong ? 'text-amber-400' : 'text-slate-400'}>
          ~{seconds.toFixed(1)}s estimated at {speed.toFixed(2)}× speed
        </span>
        {tooLong && (
          <span className="font-medium text-amber-400">
            ⚠ Likely over {MAX_SECONDS}s — trim it or raise the speed.
          </span>
        )}
      </div>
    </div>
  )
}
