// VoiceDescriptionInput.jsx
// -------------------------
// The Parler "style prompt" textarea. It only makes sense for AI (Parler) voices
// — edge_tts voices have no prompt concept — so the parent renders this ONLY when
// the selected voice's engine is "parler". When shown and left blank, the backend
// falls back to that voice's preconfigured default (shown here as the placeholder),
// so an empty box is a valid "use the default" choice, not an error.
export default function VoiceDescriptionInput({
  value,
  onChange,
  placeholder,
  disabled,
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="voice-description" className="block text-sm font-medium text-slate-200">
          Voice style prompt
        </label>
        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-300">
          AI voice
        </span>
      </div>
      <textarea
        id="voice-description"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder || 'Describe the voice: accent, emotion, pace, recording quality…'}
        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                   text-slate-100 placeholder:text-slate-500 focus:border-indigo-500
                   focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      />
      <p className="text-xs text-slate-500">
        Steers the AI voice's emotion and delivery. Leave blank to use this voice's
        default style.
      </p>
    </div>
  )
}
