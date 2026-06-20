import { useEffect, useState } from 'react'
import { getClips, getHealth, getVoices } from './api/client'
import { useGenerationJob } from './hooks/useGenerationJob'
import ScriptInput from './components/ScriptInput'
import VoiceSelect from './components/VoiceSelect'
import SpeedSlider from './components/SpeedSlider'
import ClipSelect from './components/ClipSelect'
import ProgressStages from './components/ProgressStages'
import VideoResult from './components/VideoResult'

export default function App() {
  // --- form state ---
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('')
  const [speed, setSpeed] = useState(1.2)
  const [clip, setClip] = useState('')

  // --- options loaded from the backend ---
  const [voices, setVoices] = useState([])
  const [clips, setClips] = useState([])
  const [health, setHealth] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const { phase, job, error, isBusy, start, reset } = useGenerationJob()

  // Load voices, clips, and health once on mount. Defaults are taken from the
  // backend's registries so the frontend has no hardcoded voice/clip ids.
  useEffect(() => {
    Promise.all([getVoices(), getClips(), getHealth()])
      .then(([voiceData, clipData, healthData]) => {
        setVoices(voiceData.voices)
        setVoice(voiceData.default)
        setClips(clipData.clips)
        setClip(clipData.default)
        setHealth(healthData)
      })
      .catch((err) =>
        setLoadError(
          `Couldn't reach the backend at ${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}. ` +
            `Is it running? (${err.message})`,
        ),
      )
  }, [])

  const canGenerate = text.trim().length > 0 && voice && clip && !isBusy

  function handleGenerate() {
    start({ text, voice, speed, clip })
  }

  // Prefer the backend's REAL measured duration once available; the textarea's
  // estimate is only a pre-generation hint.
  const measured = job?.duration ?? null

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Shorts Studio</h1>
          <p className="text-sm text-slate-400">Turn a script into a 9:16 short.</p>
        </header>

        {/* Backend unreachable — nothing else will work, so say so loudly. */}
        {loadError && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {loadError}
          </div>
        )}

        {/* ffmpeg missing — voice+captions work but stitching will fail. */}
        {health && !health.ffmpeg && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            ⚠ FFmpeg isn't installed on the backend. Voice and captions will run,
            but the final stitch will fail. Install it with{' '}
            <code className="rounded bg-amber-500/20 px-1">winget install Gyan.FFmpeg</code> and
            restart the backend shell.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* ---------- left: controls ---------- */}
          <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <ScriptInput value={text} onChange={setText} speed={speed} disabled={isBusy} />
            <VoiceSelect voices={voices} value={voice} onChange={setVoice} disabled={isBusy} />
            <SpeedSlider value={speed} onChange={setSpeed} disabled={isBusy} />
            <ClipSelect clips={clips} value={clip} onChange={setClip} disabled={isBusy} />

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white
                         transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy ? 'Generating…' : 'Generate'}
            </button>
          </section>

          {/* ---------- right: progress + result ---------- */}
          <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            {phase === 'idle' && (
              <p className="text-sm text-slate-500">
                Fill in a script and hit Generate. Progress shows up here.
              </p>
            )}

            {(phase === 'submitting' || phase === 'running' || phase === 'error') && (
              <>
                <h2 className="text-sm font-medium text-slate-200">Progress</h2>
                <ProgressStages stages={job?.stages} />
                {measured != null && (
                  <p className="text-xs text-slate-400">
                    Measured narration length: {measured.toFixed(1)}s
                  </p>
                )}
              </>
            )}

            {phase === 'error' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {error}
                </div>
                <button
                  onClick={reset}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Start over
                </button>
              </div>
            )}

            {phase === 'done' && job?.has_video && (
              <VideoResult jobId={job.id} duration={measured} />
            )}

            {phase === 'done' && (
              <button
                onClick={reset}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                Generate another
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
