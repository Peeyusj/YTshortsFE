// RecentProjects.jsx
// -------------------
// "Reopen a past render for editing" picker. A header button opens a modal
// listing the last KEEP_LAST_N_RENDER_JOBS successfully-finished renders
// (GET /api/jobs, scanned server-side from disk so it survives a backend
// restart); picking one calls onLoad(id), which App.handleLoadProject()
// resolves into a full editor-state restore (text/voice/speed/images at their
// exact timestamps/captions/music/intro-outro + the original narration audio).
//
// Self-contained, same pattern as AutoImageGenerator: owns its own open/loading
// state, the parent only supplies onLoad + disabled.

import { useState } from 'react'
import { getRecentJobs, videoUrl } from '../api/client'

function fmtDate(unixSeconds) {
  if (!unixSeconds) return ''
  return new Date(unixSeconds * 1000).toLocaleString()
}
function fmtDuration(seconds) {
  if (!seconds && seconds !== 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RecentProjects({ onLoad, disabled }) {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadingId, setLoadingId] = useState(null)

  async function handleOpen() {
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const res = await getRecentJobs()
      setJobs(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLoad(id) {
    setLoadingId(id)
    try {
      await onLoad(id)
      setOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={disabled}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200
                   hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Recent projects
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border
                       border-slate-800 bg-slate-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Recent projects</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300
                           hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {loading && <p className="text-xs text-slate-400">Loading…</p>}
            {error && (
              <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                {error}
              </p>
            )}
            {!loading && !error && jobs.length === 0 && (
              <p className="text-xs text-slate-500">
                No finished renders yet — generate a video and it'll show up here.
              </p>
            )}

            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-800
                             bg-slate-900/60 p-2"
                >
                  {j.has_video && (
                    <video
                      src={videoUrl(j.id)}
                      className="h-16 w-9 shrink-0 rounded object-cover bg-slate-950"
                      muted
                      preload="metadata"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{j.text_preview || '(empty script)'}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(j.created_at)}
                      {j.duration != null && ` · ${fmtDuration(j.duration)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLoad(j.id)}
                    disabled={loadingId === j.id}
                    className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium
                               text-white hover:bg-indigo-500 disabled:cursor-not-allowed
                               disabled:opacity-50"
                  >
                    {loadingId === j.id ? 'Loading…' : 'Load'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
