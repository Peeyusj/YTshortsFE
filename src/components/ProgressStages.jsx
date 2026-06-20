// Renders the voice → captions → stitch checklist from the backend's per-stage
// status. The backend's `stages` looks like:
//   { voice: {status}, captions: {status}, stitch: {status} }
// where status is pending | running | done | error.

const STAGE_LABELS = {
  voice: 'Voice',
  captions: 'Captions',
  stitch: 'Stitching',
}

// Fixed display order (objects don't guarantee key order across the wire).
const ORDER = ['voice', 'captions', 'stitch']

function StageIcon({ status }) {
  if (status === 'done') return <span className="text-emerald-400">✓</span>
  if (status === 'error') return <span className="text-rose-400">✕</span>
  if (status === 'running')
    return (
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
    )
  return <span className="text-slate-600">○</span>
}

export default function ProgressStages({ stages }) {
  if (!stages) return null
  return (
    <ol className="space-y-2">
      {ORDER.map((key) => {
        const status = stages[key]?.status ?? 'pending'
        const active = status === 'running'
        return (
          <li
            key={key}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
              active
                ? 'border-indigo-500/50 bg-indigo-500/10 text-slate-100'
                : 'border-slate-800 bg-slate-900/50 text-slate-300'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <StageIcon status={status} />
            </span>
            <span className="flex-1">{STAGE_LABELS[key]}</span>
            <span className="text-xs uppercase tracking-wide text-slate-500">{status}</span>
          </li>
        )
      })}
    </ol>
  )
}
