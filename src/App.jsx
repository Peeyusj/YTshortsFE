import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCanvases,
  getCaptionStyles,
  getClips,
  getHealth,
  getImageStyles,
  getJobProject,
  getJobTimestamps,
  getMusic,
  getSounds,
  getSplits,
  getVoices,
  jobAudioUrl,
  jobStickerUrl,
  probeAudioUrl,
  probeDuration,
} from './api/client'
import { useGenerationJob } from './hooks/useGenerationJob'
import ScriptInput from './components/ScriptInput'
import ExpressionGuide from './components/ExpressionGuide'
import VoiceSelect from './components/VoiceSelect'
import VoiceDescriptionInput from './components/VoiceDescriptionInput'
import SpeedSlider from './components/SpeedSlider'
import ClipSelect from './components/ClipSelect'
import BackgroundToggle from './components/BackgroundToggle'
import SplitSelect from './components/SplitSelect'
import CanvasSelect from './components/CanvasSelect'
import MusicSelect from './components/MusicSelect'
import CaptionStyleSelect from './components/CaptionStyleSelect'
import CaptionsToggle from './components/CaptionsToggle'
import AutoImageGenerator from './components/AutoImageGenerator'
import StickerTimeline from './components/StickerTimeline'
import IntroOutroVideo from './components/IntroOutroVideo'
import OutroToggle from './components/OutroToggle'
import ProgressStages from './components/ProgressStages'
import VideoResult from './components/VideoResult'
import RecentProjects from './components/RecentProjects'

const round2 = (v) => +v.toFixed(2)
const clamp01 = (v, max) => Math.min(max, Math.max(0, v))

export default function App() {
  // --- form state ---
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('')
  const [voiceDescription, setVoiceDescription] = useState('') // Parler style prompt
  const [speed, setSpeed] = useState(1.2)
  const [clip, setClip] = useState('')
  const [background, setBackground] = useState('black') // Feature #2: top bg colour
  const [split, setSplit] = useState('') // Feature #5: top/bottom split
  const [canvas, setCanvas] = useState('') // Feature: 16:9 support — aspect-ratio id
  const [music, setMusic] = useState('') // background music id ('' = none)
  const [musicVolume, setMusicVolume] = useState(0.18) // 0..1, under the voice
  const [captionStyle, setCaptionStyle] = useState('') // caption font/colour preset id
  const [captionsEnabled, setCaptionsEnabled] = useState(true) // subtitle burn-in, on by default
  const [placements, setPlacements] = useState([]) // Feature #3: sticker placements
  const [uploads, setUploads] = useState([]) // Feature #3: uploaded images (session only)
  // AI scene images (optional): the toggle + style/count controls, and the images
  // the backend generated. Generated images live SEPARATELY from `uploads` because
  // they aren't File objects (nothing to upload) — they're server-side PNGs the
  // render references as "generated:<id>/<file>". Each is { key, label, url }.
  const [autoImageOn, setAutoImageOn] = useState(false)
  const [imageStyle, setImageStyle] = useState('')
  const [imageCount, setImageCount] = useState(5)
  const [imageCountBounds, setImageCountBounds] = useState({ min: 1, max: 30 })
  const [generatedImages, setGeneratedImages] = useState([])
  const [showOutro, setShowOutro] = useState(true) // outro card, on by default
  // Intro/outro VIDEO wraps (session only): each is { key, name, file, url } or null.
  const [introVideo, setIntroVideo] = useState(null)
  const [outroVideo, setOutroVideo] = useState(null)
  // Recent projects / reopen-for-editing: images reused from a PAST RENDER job,
  // in the same { key, label, url } shape as generatedImages. `key` is
  // "job:<oldJobId>/<filename>" — the backend copies the file in at re-render
  // time (see pipeline.py's _resolve_sticker_image), so these never need
  // re-uploading. restoredAudioUrl is the past job's narration mp3, for the
  // voice-strip playback/waveform when no fresh probe has been done.
  const [restoredImages, setRestoredImages] = useState([])
  const [restoredAudioUrl, setRestoredAudioUrl] = useState(null)

  // --- options loaded from the backend ---
  const [voices, setVoices] = useState([])
  const [clips, setClips] = useState([])
  const [splits, setSplits] = useState([])
  const [canvases, setCanvases] = useState([])
  const [musicOptions, setMusicOptions] = useState([])
  const [soundOptions, setSoundOptions] = useState([]) // per-sticker sound effects
  const [captionStyles, setCaptionStyles] = useState([])
  const [imageStyles, setImageStyles] = useState([]) // AI image styles
  const [health, setHealth] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Feature #3 timeline: real narration from /api/probe (null = not loaded yet).
  // duration scales the timeline; words drive the voice strip (what's spoken
  // when); probeId fetches the narration audio for playback + waveform.
  const [timelineDuration, setTimelineDuration] = useState(null)
  const [timelineWords, setTimelineWords] = useState([])
  const [probeId, setProbeId] = useState(null)
  const [probing, setProbing] = useState(false)
  const uploadSeq = useRef(0) // monotonic counter for unique upload keys
  // The duration `placements`/`generatedImages` timestamps are currently valid
  // for. Speed/voice/description changes shift this (audio gets shorter/longer)
  // without moving the script content, so on the next successful probe we
  // rescale existing placements proportionally instead of leaving them at
  // their old absolute seconds (which is what caused images to drift out of
  // sync with the narration after changing speed). A text edit changes the
  // script itself, so old positions are no longer meaningful — those get
  // cleared instead of rescaled (see the text-change effect below).
  const referenceDurationRef = useRef(null)
  const prevTextRef = useRef(text)
  // Recent projects / reopen-for-editing: handleLoadProject sets both of these
  // right before calling setText/setVoice/etc, so the two invalidation effects
  // below (which exist to clear stale state after a MANUAL edit) skip exactly
  // one cycle instead of immediately wiping the state that was just restored.
  const restoringRef = useRef(false)
  const skipDurationResetRef = useRef(false)

  const { phase, job, error, isBusy, start, reset } = useGenerationJob()

  // Load all backend-driven options once on mount. Defaults come from the
  // registries so the frontend hardcodes no voice/clip/split ids.
  useEffect(() => {
    Promise.all([
      getVoices(),
      getClips(),
      getSplits(),
      getCanvases(),
      getMusic(),
      getSounds(),
      getCaptionStyles(),
      getImageStyles(),
      getHealth(),
    ])
      .then(([voiceData, clipData, splitData, canvasData, musicData, soundData, captionStyleData, imageStyleData, healthData]) => {
        setVoices(voiceData.voices)
        setVoice(voiceData.default)
        setClips(clipData.clips)
        setClip(clipData.default)
        setSplits(splitData.splits)
        setSplit(splitData.default)
        setCanvases(canvasData.canvases)
        setCanvas(canvasData.default)
        setMusicOptions(musicData.music)
        // default is null (no music) -> '' keeps the "None" option selected.
        setMusic(musicData.default ?? '')
        setMusicVolume(musicData.default_volume ?? 0.18)
        setSoundOptions(soundData.sounds ?? [])
        setCaptionStyles(captionStyleData.styles ?? [])
        setCaptionStyle(captionStyleData.default ?? '')
        // AI image styles + count bounds (feature is off by default via the toggle).
        setImageStyles(imageStyleData.styles ?? [])
        setImageStyle(imageStyleData.default ?? '')
        setImageCount(imageStyleData.default_count ?? 5)
        setImageCountBounds({
          min: imageStyleData.min_count ?? 1,
          max: imageStyleData.max_count ?? 30,
        })
        setHealth(healthData)
      })
      .catch((err) =>
        setLoadError(
          `Couldn't reach the backend at ${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}. ` +
            `Is it running? (${err.message})`,
        ),
      )
  }, [])

  // The selected voice's registry entry. Its `engine` decides whether the Parler
  // style-prompt box is shown; `default_description` is the placeholder for it.
  const selectedVoice = voices.find((v) => v.id === voice) ?? null
  const isParler = selectedVoice?.engine === 'parler'

  // The probed duration is only valid for the text/voice/speed/description it was
  // measured with — invalidate it (re-lock the timeline) when any of those change.
  // voiceDescription is included because for Parler a different prompt = different
  // audio = different duration.
  useEffect(() => {
    // Skipped exactly once right after handleLoadProject restores a past
    // project's own duration/words/audio — those ARE valid for the
    // text/voice/speed/description that was just set, so this invalidation
    // (meant for a subsequent MANUAL edit) doesn't apply to that render.
    if (skipDurationResetRef.current) {
      skipDurationResetRef.current = false
      return
    }
    setTimelineDuration(null)
    setTimelineWords([])
    setProbeId(null)
    setRestoredAudioUrl(null)
  }, [text, voice, speed, voiceDescription])

  // Editing the script changes the words themselves, so existing placements'
  // start/end seconds no longer correspond to anything meaningful (unlike a
  // speed/voice/description change, which just stretches/compresses the same
  // content — see the rescale in handleLoadTimeline above). Drop them instead
  // of silently carrying stale positions into the next render.
  useEffect(() => {
    // Skipped exactly once right after handleLoadProject sets `text` — the
    // placements it just restored ARE meaningful for that text, so don't clear
    // them; just resync the "previous text" baseline for the next real edit.
    if (restoringRef.current) {
      restoringRef.current = false
      prevTextRef.current = text
      return
    }
    if (prevTextRef.current !== text) {
      prevTextRef.current = text
      referenceDurationRef.current = null
      setPlacements([])
      setGeneratedImages([])
      setRestoredImages([])
    }
  }, [text])

  // A loaded timeline (`timelineDuration`) is required before placements can
  // even be created (StickerTimeline hides the editor without it), but
  // changing speed/voice/description invalidates it while leaving any
  // already-placed images/scenes in state at their old (now-wrong) seconds.
  // Block Generate until the timeline is reloaded so a render can never fire
  // against a duration other than the one the placements were positioned for.
  const hasStaleTimeline =
    (placements.length > 0 || generatedImages.length > 0) && timelineDuration == null
  const canGenerate =
    text.trim().length > 0 && voice && clip && split && !isBusy && !hasStaleTimeline

  function handleLoadTimeline() {
    setProbing(true)
    probeDuration({ text, voice, speed, voiceDescription })
      .then((res) => {
        // Same script, new duration (speed/voice/description changed since the
        // last probe): the words moved uniformly with the narration length, so
        // shift existing placements by the same ratio rather than leaving them
        // at their old absolute seconds — that mismatch is what let images run
        // faster/slower than the narration after a speed change.
        const prevDuration = referenceDurationRef.current
        if (prevDuration && res.duration && prevDuration !== res.duration) {
          const ratio = res.duration / prevDuration
          setPlacements((prev) =>
            prev.map((p) => ({
              ...p,
              start: round2(clamp01(p.start * ratio, res.duration)),
              end: round2(clamp01(p.end * ratio, res.duration)),
            })),
          )
        }
        referenceDurationRef.current = res.duration
        setTimelineDuration(res.duration)
        setTimelineWords(res.words ?? [])
        setProbeId(res.probe_id ?? null)
      })
      .catch((err) => setLoadError(`Couldn't measure narration: ${err.message}`))
      .finally(() => setProbing(false))
  }

  // Recent projects / reopen-for-editing: repopulate the ENTIRE editor state from
  // a past render's resolved settings (GET /api/jobs/{id}/project) + its real
  // measured timeline (GET /api/jobs/{id}/timestamps) — no fresh /api/probe call,
  // so reopening a project never resynthesizes the narration. Throws on failure so
  // the RecentProjects picker (which awaits this) can show the error itself.
  async function handleLoadProject(id) {
    const [project, timestamps] = await Promise.all([getJobProject(id), getJobTimestamps(id)])

    // Both invalidation effects below react to the setters this triggers; skip
    // their "clear stale state" behaviour for exactly the render this causes.
    restoringRef.current = true
    skipDurationResetRef.current = true

    setText(project.text)
    setVoice(project.voice)
    setVoiceDescription(project.voice_description || '')
    setSpeed(project.speed)
    setClip(project.clip)
    setBackground(project.background)
    if (project.split) setSplit(project.split)
    if (project.canvas) setCanvas(project.canvas)
    setMusic(project.music || '')
    setMusicVolume(project.music_volume)
    if (project.caption_style) setCaptionStyle(project.caption_style)
    setCaptionsEnabled(project.captions_enabled)
    setShowOutro(project.show_outro)

    referenceDurationRef.current = timestamps.duration ?? null
    prevTextRef.current = project.text
    setTimelineDuration(timestamps.duration ?? null)
    setTimelineWords(timestamps.words ?? [])
    setProbeId(null)
    setRestoredAudioUrl(jobAudioUrl(id))

    // Rebuild placements from the resolved sticker list. Each image is referenced
    // via a "job:<id>/<file>" key — the backend copies the file in at re-render
    // time (pipeline.py's _resolve_sticker_image), so nothing needs re-uploading.
    const images = []
    const restored = (project.stickers || []).map((s, i) => {
      const key = `job:${id}/${s.image}`
      images.push({ key, label: s.image, url: jobStickerUrl(id, s.image) })
      return { id: `restored-${i}`, ...s, image: key }
    })
    setPlacements(restored)
    setRestoredImages(images)

    setIntroVideo(
      project.intro_video
        ? {
            key: `job:${id}/${project.intro_video}`,
            name: project.intro_video,
            url: jobStickerUrl(id, project.intro_video),
          }
        : null,
    )
    setOutroVideo(
      project.outro_video
        ? {
            key: `job:${id}/${project.outro_video}`,
            name: project.outro_video,
            url: jobStickerUrl(id, project.outro_video),
          }
        : null,
    )
  }

  // Feature #3: add uploaded images to session state. Each gets a unique `key`
  // (used as both the placement reference and the filename sent to the backend),
  // a human label, the File object (sent on generate), and an object URL preview.
  // A monotonic ref counter guarantees keys stay unique even across removals.
  function handleAddFiles(fileList) {
    const additions = fileList.map((file) => {
      const safe = file.name.replace(/[^\w.-]+/g, '_')
      const key = `${uploadSeq.current++}_${safe}`
      return { key, label: file.name, file, url: URL.createObjectURL(file) }
    })
    setUploads((prev) => [...prev, ...additions])
  }
  function handleRemoveUpload(key) {
    // Generated images live in their own state (no object URL to revoke) — remove
    // there; everything else is a user upload.
    if (String(key).startsWith('generated:')) {
      setGeneratedImages((prev) => prev.filter((g) => g.key !== key))
      setPlacements((prev) => prev.filter((p) => p.image !== key))
      return
    }
    // Images reused from a past render (Recent projects) — same shape as
    // generated images, no object URL to revoke.
    if (String(key).startsWith('job:')) {
      setRestoredImages((prev) => prev.filter((r) => r.key !== key))
      setPlacements((prev) => prev.filter((p) => p.image !== key))
      return
    }
    setUploads((prev) => {
      const gone = prev.find((u) => u.key === key)
      if (gone) URL.revokeObjectURL(gone.url)
      return prev.filter((u) => u.key !== key)
    })
    // Drop any placements that referenced the removed image.
    setPlacements((prev) => prev.filter((p) => p.image !== key))
  }

  // AI scene images finished: replace the previous AI batch and auto-create a
  // timeline block for each at the LLM's suggested start/end, leaving any
  // manually-placed images untouched. The user then reviews/adjusts/deletes.
  function handleGeneratedImages(images) {
    setGeneratedImages(images)
    setPlacements((prev) => {
      const manual = prev.filter((p) => !String(p.image).startsWith('generated:'))
      const auto = images.map((img) => ({
        id: `gen-${img.key}`,
        image: img.key, // "generated:<sceneJobId>/<file>" — backend resolves it
        start: img.start,
        end: img.end,
        x: 'center',
        y: 'upper',
        // AI scene images fill the top region and get a gentle Ken Burns zoom by
        // default, so a still generated image looks "alive" without extra setup.
        // The user can switch the effect (or off) per image in the timeline.
        full_width: true,
        animation: 'zoom-in',
        animation_duration: 0.4,
        sound_id: 'whoosh_soft',
      }))
      return [...manual, ...auto]
    })
  }

  // What the timeline shows as placeable/previewable images: user uploads PLUS
  // generated images PLUS images reused from a past render (in the same
  // { key, label, url } shape). Neither of the latter two carry a File, so
  // they're excluded from the multipart upload in handleGenerate (which reads
  // from `uploads`, not this merged list).
  const timelineImages = useMemo(
    () => [
      ...uploads,
      ...generatedImages.map((g) => ({ key: g.key, label: g.label, url: g.url })),
      ...restoredImages,
    ],
    [uploads, generatedImages, restoredImages],
  )

  // Intro/outro video slots. Build a session upload record (unique key = the
  // filename the backend saves it under) and revoke the old preview URL when
  // replaced/cleared so we don't leak object URLs.
  function pickWrapVideo(setter) {
    return (file) => {
      const safe = file.name.replace(/[^\w.-]+/g, '_')
      const key = `${uploadSeq.current++}_${safe}`
      setter((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { key, name: file.name, file, url: URL.createObjectURL(file) }
      })
    }
  }
  function clearWrapVideo(setter) {
    return () =>
      setter((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return null
      })
  }

  // Top-region fraction of the selected split (top / 1920) for the 9:16 preview.
  const selectedSplit = splits.find((s) => s.id === split) ?? null
  const topFrac = selectedSplit?.top ? selectedSplit.top / 1920 : 1280 / 1920

  function handleGenerate() {
    // Strip the client-only `id` from placements; backend wants {image,start,end,x,y}.
    const stickers = placements.map(({ id, ...rest }) => rest)
    // Only send images actually used by a placement.
    const usedKeys = new Set(placements.map((p) => p.image))
    const files = uploads.filter((u) => usedKeys.has(u.key))
    // Intro/outro clips ride in the same `files` part (keyed by their filename);
    // the payload references them by that key via intro_video/outro_video. A
    // restored (Recent projects) intro/outro has no `.file` — it's reused
    // server-side via its "job:<id>/<file>" key instead of being re-uploaded.
    if (introVideo?.file) files.push(introVideo)
    if (outroVideo?.file) files.push(outroVideo)
    // Only send a description for Parler voices; edge ignores it anyway.
    start({
      text,
      voice,
      voiceDescription: isParler ? voiceDescription : '',
      speed,
      clip,
      background,
      split,
      canvas,
      stickers,
      showOutro,
      music,
      musicVolume,
      captionStyle,
      captionsEnabled,
      introVideo: introVideo?.key ?? null,
      outroVideo: outroVideo?.key ?? null,
      files,
    })
  }

  // Prefer the backend's REAL measured duration once available; the textarea's
  // estimate is only a pre-generation hint.
  const measured = job?.duration ?? null

  // The voice strip's audio source: a live probe if one's been taken, else a
  // restored past-render's narration (Recent projects), else nothing.
  const audioSrc = probeId ? probeAudioUrl(probeId) : restoredAudioUrl

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Shorts Studio</h1>
            <p className="text-sm text-slate-400">Turn a script into a 9:16 short.</p>
          </div>
          <RecentProjects onLoad={handleLoadProject} disabled={isBusy} />
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
            <ExpressionGuide
              onInsertSample={(sample) => setText((prev) => (prev.trim() ? `${prev}\n${sample}` : sample))}
              disabled={isBusy}
            />
            <VoiceSelect voices={voices} value={voice} onChange={setVoice} disabled={isBusy} />
            {/* Parler-only: the style prompt appears for AI voices, stays hidden
                for standard edge_tts voices. */}
            {isParler && (
              <VoiceDescriptionInput
                value={voiceDescription}
                onChange={setVoiceDescription}
                placeholder={selectedVoice?.default_description}
                disabled={isBusy}
              />
            )}
            <SpeedSlider value={speed} onChange={setSpeed} disabled={isBusy} />
            <CanvasSelect canvases={canvases} value={canvas} onChange={setCanvas} disabled={isBusy} />
            <div className="space-y-1">
              <ClipSelect
                clips={clips}
                value={clip}
                onChange={setClip}
                disabled={isBusy || split === 'full' || canvas === 'landscape'}
              />
              {(split === 'full' || canvas === 'landscape') && (
                <p className="text-xs text-slate-400">
                  Ignored — {canvas === 'landscape'
                    ? 'landscape (16:9) videos always render full-screen, no gameplay clip.'
                    : 'the "Full screen" split has no gameplay clip.'}
                </p>
              )}
            </div>
            <BackgroundToggle value={background} onChange={setBackground} disabled={isBusy} />
            <div className="space-y-1">
              <SplitSelect
                splits={splits}
                value={split}
                onChange={setSplit}
                disabled={isBusy || canvas === 'landscape'}
              />
              {canvas === 'landscape' && (
                <p className="text-xs text-slate-400">
                  Ignored — landscape (16:9) videos always render full-screen.
                </p>
              )}
            </div>
            <MusicSelect
              music={musicOptions}
              value={music}
              onChange={setMusic}
              volume={musicVolume}
              onVolumeChange={setMusicVolume}
              disabled={isBusy}
            />
            <CaptionStyleSelect
              styles={captionStyles}
              value={captionStyle}
              onChange={setCaptionStyle}
              background={background}
              disabled={isBusy || !captionsEnabled}
            />
            <CaptionsToggle
              value={captionsEnabled}
              onChange={setCaptionsEnabled}
              disabled={isBusy}
            />
            <AutoImageGenerator
              enabled={autoImageOn}
              onToggle={setAutoImageOn}
              styles={imageStyles}
              style={imageStyle}
              onStyleChange={setImageStyle}
              count={imageCount}
              onCountChange={setImageCount}
              minCount={imageCountBounds.min}
              maxCount={imageCountBounds.max}
              text={text}
              duration={timelineDuration}
              words={timelineWords}
              split={split}
              canvas={canvas}
              disabled={isBusy}
              onImagesReady={handleGeneratedImages}
            />
            <IntroOutroVideo
              intro={introVideo}
              outro={outroVideo}
              onPickIntro={pickWrapVideo(setIntroVideo)}
              onPickOutro={pickWrapVideo(setOutroVideo)}
              onClearIntro={clearWrapVideo(setIntroVideo)}
              onClearOutro={clearWrapVideo(setOutroVideo)}
              disabled={isBusy}
            />
            <OutroToggle
              value={showOutro}
              onChange={setShowOutro}
              disabled={isBusy}
              available={health?.outro}
            />

            {hasStaleTimeline && (
              <p className="text-xs text-amber-300">
                Speed, voice, or style changed since your images were placed — reload the
                timeline below so they line up with the new narration before generating.
              </p>
            )}
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

        {/* ---------- full-width image-timeline editor + 9:16 preview ---------- */}
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <StickerTimeline
            duration={timelineDuration}
            words={timelineWords}
            audioSrc={audioSrc}
            loading={probing}
            onLoadTimeline={handleLoadTimeline}
            uploads={timelineImages}
            onAddFiles={handleAddFiles}
            onRemoveUpload={handleRemoveUpload}
            placements={placements}
            onChange={setPlacements}
            disabled={isBusy}
            sounds={soundOptions}
            background={background}
            topFrac={topFrac}
          />
        </section>
      </div>
    </div>
  )
}
