// StylePreview.jsx
// ----------------
// A live 9:16 preview of how the CAPTIONS and the IMAGE TRANSITIONS will
// behave, so a choice can be made before paying for a render.
//
// Why a hand-driven rAF loop rather than CSS keyframes: every timing here is a
// function of the user's current settings (transition length, Ken Burns zoom,
// caption density, word timings). Keyframes would mean regenerating stylesheets
// on every slider move; computing opacity/scale from a clock is both simpler and
// exact. Each helper below mirrors one piece of the real render:
//
//   imageState()   <- stitch_video.py's _transition_plan + _kenburns_chain
//   groupWords()   <- generate_captions.py's group_words (the density knob)
//   activeWord()   <- generate_captions.py's _karaoke_events
//
// It is an approximation of pixels, not of timing — the numbers driving it are
// the real ones, so what you see is when things happen, not exactly how the
// libass glyphs will land.

import { useEffect, useMemo, useRef, useState } from 'react'
import { captionColors } from '../lib/ass'

// Stand-in scenes for when no AI images have been generated yet. Deliberately
// distinct from each other so a hard cut is obvious and a crossfade reads.
const PLACEHOLDER_SCENES = [
  'linear-gradient(165deg,#2B2F63 0%,#5B4A7A 55%,#1B1D3A 100%)',
  'linear-gradient(165deg,#F0A552 0%,#E4643C 55%,#8E3F2E 100%)',
  'linear-gradient(165deg,#3C7E7A 0%,#7FB07F 55%,#20514F 100%)',
]

// A short Hinglish line in the same register as the real scripts, used when the
// timeline hasn't been probed yet so there are no true word timings to show.
const SAMPLE_WORDS =
  'Ye baat aaj tak kisi ko pata nahi thi lekin sach kuch aur hi nikla'
    .split(' ')
    .map((word, i) => ({ word, start: i * 0.42, end: i * 0.42 + 0.36 }))

const KB_CYCLE = ['zoom-in', 'pan-in', 'zoom-out', 'pan-out']

// Mirrors generate_captions.group_words closely enough for a preview: fill up to
// max_words, breaking early at a real pause once min_words is satisfied. The
// backend also breaks on Hinglish connectives; leaving that out here only
// changes WHERE a line breaks, never how the animation behaves.
function groupWords(words, minWords, maxWords) {
  const lines = []
  let line = []
  for (let i = 0; i < words.length; i += 1) {
    line.push(words[i])
    const next = words[i + 1]
    if (!next) break
    const pause = next.start - words[i].end >= 0.35
    if (line.length >= maxWords || (line.length >= minWords && pause)) {
      lines.push(line)
      line = []
    }
  }
  if (line.length) lines.push(line)
  return lines.map((ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end }))
}

// Opacity / scale / x-offset for one image at time t. This is the preview's
// half of stitch_video.py's _transition_plan: same clamp (a transition can never
// take more than 40% of an image's window), same overlap rules per mode.
function imageState(t, index, start, end, mode, seconds, zoom, loop) {
  const window = end - start
  const d = mode === 'none' ? 0 : Math.max(0, Math.min(seconds, window * 0.4))
  const overlaps = mode === 'crossfade' || mode === 'slide'
  const tail = overlaps ? d : 0

  // The loop wraps, so an image also has to be evaluated one lap ahead —
  // otherwise the last image's fade-out never meets the first's fade-in.
  const candidates = [t, t + loop]
  let best = null
  for (const now of candidates) {
    if (now < start || now > end + tail) continue
    let opacity = 1
    if (d > 0) {
      if (now < start + d) opacity = (now - start) / d
      else if (overlaps && now > end) opacity = Math.max(0, 1 - (now - end) / d)
      else if (!overlaps && now > end - d) opacity = Math.max(0, (end - now) / d)
    }
    // Ken Burns runs across the image's own window only; the cloned tail holds
    // the final frame, which is what stop_mode=clone does server-side.
    const p = Math.max(0, Math.min(1, (now - start) / Math.max(0.001, window)))
    const effect = KB_CYCLE[index % KB_CYCLE.length]
    let scale = 1
    let ox = 0
    if (zoom > 1) {
      if (effect === 'zoom-in') scale = 1 + (zoom - 1) * p
      else if (effect === 'zoom-out') scale = zoom - (zoom - 1) * p
      else {
        scale = zoom
        // Pans hold the zoom and slide the crop instead; the visible travel is
        // whatever the zoom leaves over, same as the zoompan x expression.
        const travel = (zoom - 1) * 50
        ox = effect === 'pan-in' ? -travel + 2 * travel * p : travel - 2 * travel * p
      }
    }
    // `slide` brings the incoming image in from the right edge as it fades up.
    const slideX = mode === 'slide' && d > 0 && now < start + d
      ? (1 - (now - start) / d) * 100
      : 0
    best = { opacity, scale, ox, slideX }
  }
  return best
}

export default function StylePreview({
  captionStyle,
  captionAnimation,
  captionHighlightCss,
  captionDensity,
  captionsEnabled,
  captionYFraction = 0.5,
  background = 'black',
  transition,
  transitionSeconds,
  kenBurnsZoom,
  images = [],
  words = [],
  topFraction = 1280 / 1920,
}) {
  const [playing, setPlaying] = useState(true)
  const [t, setT] = useState(0)
  const startedAt = useRef(0)
  const offset = useRef(0)
  const raf = useRef(0)

  // Real probe words when the timeline has been loaded, otherwise the sample
  // line — so the preview shows YOUR script's rhythm as soon as it's available.
  const previewWords = useMemo(() => {
    const source = words.length >= 4 ? words : SAMPLE_WORDS
    // Cap the loop so the preview stays a quick, watchable cycle even on a
    // 60-second script, and rebase to zero so it starts immediately.
    const t0 = source[0].start
    return source
      .map((w) => ({ word: w.word, start: w.start - t0, end: w.end - t0 }))
      .filter((w) => w.start < 7)
  }, [words])

  const lines = useMemo(
    () => groupWords(previewWords, captionDensity?.min_words ?? 2, captionDensity?.max_words ?? 3),
    [previewWords, captionDensity],
  )

  const loop = useMemo(
    () => Math.max(4, (previewWords[previewWords.length - 1]?.end ?? 6) + 0.6),
    [previewWords],
  )

  // Up to three scenes: the first generated images if there are any, else the
  // placeholder gradients. Three is enough to show two handovers.
  const scenes = useMemo(() => {
    const real = images.filter((i) => i?.url).slice(0, 3)
    if (real.length >= 2) return real.map((i) => ({ url: i.url }))
    return PLACEHOLDER_SCENES.map((bg) => ({ bg }))
  }, [images])

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(raf.current)
      return undefined
    }
    startedAt.current = performance.now()
    const tick = (now) => {
      const elapsed = offset.current + (now - startedAt.current) / 1000
      setT(elapsed % loop)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, loop])

  function togglePlay() {
    if (playing) offset.current = t
    setPlaying((p) => !p)
  }

  const slot = loop / scenes.length
  const colors = captionColors(captionStyle, background)
  const highlight = captionHighlightCss || '#F2A33C'
  const fontSizePx = captionStyle?.font_size ?? 72
  // The .ass font size is measured against the 1080-wide render canvas, so it is
  // expressed here as a share of the preview's own width — the caption then
  // scales with the preview instead of needing a magic pixel number.
  const fontSize = `${(fontSizePx / 1080) * 100}cqw`

  const activeLine = lines.find((l) => t >= l.start && t <= l.end + 0.25) ?? null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">Preview</span>
        <button
          type="button"
          onClick={togglePlay}
          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs
                     text-slate-200 hover:border-indigo-500 hover:text-indigo-300
                     focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <div className="flex gap-4">
        <div
          className="relative shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
          style={{ width: 172, aspectRatio: '9 / 16', containerType: 'inline-size' }}
        >
          {/* Top region — where the AI images and captions live */}
          <div
            className="absolute inset-x-0 top-0 overflow-hidden"
            style={{
              height: `${topFraction * 100}%`,
              background: background === 'white' ? '#ffffff' : '#000000',
            }}
          >
            {scenes.map((scene, i) => {
              const st = imageState(
                t, i, i * slot, (i + 1) * slot,
                transition, transitionSeconds, kenBurnsZoom, loop,
              )
              if (!st) return null
              return (
                <div
                  key={i}
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    opacity: st.opacity,
                    backgroundImage: scene.url ? `url(${scene.url})` : scene.bg,
                    transform: `translateX(${st.slideX}%) scale(${st.scale}) translateX(${st.ox}%)`,
                  }}
                />
              )
            })}

            {/* Captions, positioned the same way the .ass \pos tag will place them */}
            {captionsEnabled && activeLine && (
              <div
                className="absolute inset-x-0 px-2"
                style={{ top: `${captionYFraction * 100}%`, transform: 'translateY(-50%)' }}
              >
                <div
                  className="flex flex-wrap justify-center"
                  style={{
                    gap: '0.1em 0.22em',
                    fontFamily: captionStyle?.font ?? 'Arial Black',
                    fontWeight: captionStyle?.bold === false ? 400 : 900,
                    fontSize,
                    lineHeight: 1.18,
                    textAlign: 'center',
                  }}
                >
                  {activeLine.words.map((w, i) => {
                    const isActive =
                      captionAnimation !== 'off' && t >= w.start &&
                      (i === activeLine.words.length - 1
                        ? t <= activeLine.end
                        : t < activeLine.words[i + 1].start)
                    // `pop` eases the scale up over ~90ms, matching the \t
                    // transform the .ass writer emits.
                    const ramp = isActive
                      ? Math.min(1, (t - w.start) / 0.09)
                      : 0
                    const scale = captionAnimation === 'pop' ? 1 + 0.12 * ramp : 1
                    return (
                      <span
                        key={i}
                        style={{
                          display: 'inline-block',
                          transformOrigin: '50% 70%',
                          transform: `scale(${scale})`,
                          color: isActive ? highlight : colors.fill,
                          ...(captionStyle?.box
                            ? { backgroundColor: colors.outline, padding: '0 0.12em', borderRadius: 2 }
                            : { WebkitTextStroke: `0.06em ${colors.outline}` }),
                        }}
                      >
                        {w.word}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Gameplay strip, so the split is honest about how much room captions get */}
          <div
            className="absolute inset-x-0 bottom-0 border-t border-white/10"
            style={{
              height: `${(1 - topFraction) * 100}%`,
              background:
                'repeating-linear-gradient(115deg,#1E2A3D 0 10px,#24334A 10px 20px)',
            }}
          >
            <span className="absolute bottom-1 left-1.5 text-[7px] uppercase tracking-wider text-white/40">
              gameplay
            </span>
          </div>

          {/* Playhead — the same clock everything above is driven by */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-white/15">
            <div
              className="h-full bg-indigo-400"
              style={{ width: `${(t / loop) * 100}%` }}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-xs text-slate-400">
          <p>
            {words.length >= 4
              ? 'Running against your real narration timings.'
              : 'Sample line — load the timeline to preview your own script’s timings.'}
          </p>
          <p>
            {images.some((i) => i?.url)
              ? 'Showing your generated scene images.'
              : 'Placeholder scenes — generate images to preview the real ones.'}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1">
            <dt className="text-slate-500">Words/line</dt>
            <dd className="text-slate-300">
              {captionDensity?.min_words ?? 2}&ndash;{captionDensity?.max_words ?? 3}
            </dd>
            <dt className="text-slate-500">Handover</dt>
            <dd className="text-slate-300">
              {transition === 'none' ? 'hard cut' : `${transitionSeconds.toFixed(2)}s`}
            </dd>
            <dt className="text-slate-500">Zoom</dt>
            <dd className="text-slate-300">
              {kenBurnsZoom > 1 ? `${kenBurnsZoom.toFixed(2)}×, varied per image` : 'none'}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  )
}
