// Expression guide (Feature #1 docs in the UI). Explains the emotion tags, what
// each does to the voice, and offers a one-click sample so it's obvious how to
// use them. Tags are deltas on top of the speed slider and are never spoken.
const SAMPLE = `Toh ek baat batau? [excited]Aaj jo hua na, woh sunke aap bhi shock ho jaoge![/excited] Maine socha tha sab normal hai. [sad]Lekin sab kuch ek pal mein badal gaya.[/sad] [calm]Khair, ab sab theek hai. End mein sab samajh aa jayega.[/calm]`

const TAGS = [
  { tag: '[excited] … [/excited]', effect: 'Faster + higher pitch', use: 'hooks, punchlines, big reveals' },
  { tag: '[sad] … [/sad]', effect: 'Slower + lower pitch', use: 'emotional or serious beats' },
  { tag: '[calm] … [/calm]', effect: 'Normal (your slider speed)', use: 'neutral narration / closers' },
]

export default function ExpressionGuide({ onInsertSample, disabled }) {
  return (
    <details className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-200">
        Voice expression — how to add emotion 🎙️
      </summary>

      <div className="mt-3 space-y-3 text-slate-300">
        <p className="text-xs text-slate-400">
          Wrap any part of your script in a tag to change how it's spoken. The tags themselves are
          never read aloud. Untagged text uses your normal voice + speed.
        </p>

        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 pr-2 font-medium">Tag</th>
              <th className="py-1 pr-2 font-medium">Effect</th>
              <th className="py-1 font-medium">Good for</th>
            </tr>
          </thead>
          <tbody>
            {TAGS.map((t) => (
              <tr key={t.tag} className="border-t border-slate-800">
                <td className="py-1 pr-2">
                  <code className="rounded bg-slate-800 px-1">{t.tag}</code>
                </td>
                <td className="py-1 pr-2">{t.effect}</td>
                <td className="py-1 text-slate-400">{t.use}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <div className="mb-1 text-xs text-slate-400">Example:</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-xs text-slate-300">
{SAMPLE}
          </pre>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onInsertSample(SAMPLE)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200
                     hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Insert example script
        </button>

        <p className="text-[11px] text-slate-500">
          Tip: tags can wrap a single word or several sentences, but don't nest them
          (e.g. no <code>[excited]</code> inside another <code>[excited]</code>).
        </p>
      </div>
    </details>
  )
}
