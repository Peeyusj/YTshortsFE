import { useEffect, useState } from 'react'
import {
  getClips,
  getHealth,
  getSplits,
  getStickers,
  getVoices,
  probeDuration,
} from './api/client'
import { useGenerationJob } from './hooks/useGenerationJob'
import ScriptInput from './components/ScriptInput'
import VoiceSelect from './components/VoiceSelect'
import SpeedSlider from './components/SpeedSlider'
import ClipSelect from './components/ClipSelect'
import BackgroundToggle from './components/BackgroundToggle'
import SplitSelect from './components/SplitSelect'
import StickerTimeline from './components/StickerTimeline'
import OutroToggle from './components/OutroToggle'
import ProgressStages from './components/ProgressStages'
import VideoResult from './components/VideoResult'

export default function App() {
  // --- form state ---
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('')
  const [speed, setSpeed] = useState(1.2)
  const [clip, setClip] = useState('')
  const [background, setBackground] = useState('black') // Feature #2: top bg colour
  const [split, setSplit] = useState('') // Feature #5: top/bottom split
  const [placements, setPlacements] = useState([]) // Feature #3: stickers
  const [showOutro, setShowOutro] = useState(true) // outro card, on by default

  // --- options loaded from the backend ---
  const [voices, setVoices] = useState([])
  const [clips, setClips] = useState([])
  const [splits, setSplits] = useState([])
  const [stickerLib, setStickerLib] = useState([])
  const [health, setHealth] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Feature #3 timeline: real duration from /api/probe (null = not loaded yet).
  const [timelineDuration, setTimelineDuration] = useState(null)
  const [probing, setProbing] = useState(false)

  const { phase, job, error, isBusy, start, reset } = useGenerationJob()

  // Load all backend-driven options once on mount. Defaults come from the
  // registries so the frontend hardcodes no voice/clip/split ids.
  useEffect(() => {
    Promise.all([getVoices(), getClips(), getSplits(), getStickers(), getHealth()])
      .then(([voiceData, clipData, splitData, stickerData, healthData]) => {
        setVoices(voiceData.voices)
        setVoice(voiceData.default)
        setClips(clipData.clips)
        setClip(clipData.default)
        setSplits(splitData.splits)
        setSplit(splitData.default)
        setStickerLib(stickerData.stickers)
        setHealth(healthData)
      })
      .catch((err) =>
        setLoadError(
          `Couldn't reach the backend at ${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}. ` +
            `Is it running? (${err.message})`,
        ),
      )
  }, [])

  // The probed duration is only valid for the text/voice/speed it was measured
  // with — invalidate it (re-lock the timeline) when any of those change.
  useEffect(() => {
    setTimelineDuration(null)
  }, [text, voice, speed])

  const canGenerate = text.trim().length > 0 && voice && clip && split && !isBusy

  function handleLoadTimeline() {
    setProbing(true)
    probeDuration({ text, voice, speed })
      .then((res) => setTimelineDuration(res.duration))
      .catch((err) => setLoadError(`Couldn't measure narration: ${err.message}`))
      .finally(() => setProbing(false))
  }

  function handleGenerate() {
    // Strip the client-only `id` from placements; backend wants {image,start,end,x,y}.
    const stickers = placements.map(({ id, ...rest }) => rest)
    start({ text, voice, speed, clip, background, split, stickers, showOutro })
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
            <BackgroundToggle value={background} onChange={setBackground} disabled={isBusy} />
            <SplitSelect splits={splits} value={split} onChange={setSplit} disabled={isBusy} />
            <StickerTimeline
              duration={timelineDuration}
              loading={probing}
              onLoadTimeline={handleLoadTimeline}
              library={stickerLib}
              placements={placements}
              onChange={setPlacements}
              disabled={isBusy}
            />
            <OutroToggle
              value={showOutro}
              onChange={setShowOutro}
              disabled={isBusy}
              available={health?.outro}
            />

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
