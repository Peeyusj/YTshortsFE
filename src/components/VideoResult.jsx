import { videoUrl } from '../api/client'

// Shown when a job finishes: a 9:16 preview player + a download button. The
// <video> and <a> both point straight at the backend's streaming endpoint, so
// we never hold the mp4 bytes in JS.
export default function VideoResult({ jobId, duration }) {
  const url = videoUrl(jobId)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">Result</h2>
        {duration != null && (
          <span className="text-xs text-slate-400">{duration.toFixed(1)}s</span>
        )}
      </div>

      {/* Shorts are 9:16; cap the height so the portrait video fits the panel. */}
      <video
        src={url}
        controls
        className="mx-auto max-h-[70vh] rounded-lg border border-slate-800 bg-black"
      />

      <a
        href={url}
        download={`short_${jobId}.mp4`}
        className="block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm
                   font-medium text-white transition hover:bg-emerald-500"
      >
        ⬇ Download MP4
      </a>
    </div>
  )
}
