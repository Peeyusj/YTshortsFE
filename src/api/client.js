// client.js
// ---------
// The ONLY module that knows the backend's URLs and response shapes. Components
// and hooks call these functions, never fetch() directly. If the API changes,
// this is the one file to update — that's the "cleanly separated" contract.

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

// Small helper: throw on non-2xx so callers can try/catch instead of checking
// res.ok everywhere. FastAPI puts error text under `detail`.
async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export function getHealth() {
  return request('/api/health')
}

export function getVoices() {
  return request('/api/voices')
}

export function getClips() {
  return request('/api/clips')
}

export function getSplits() {
  return request('/api/splits')
}

// Drives the background-music dropdown. Returns
//   { music: [{ id, label, path, artist, mood, description }], default, default_volume }
// `default` is null (no music) and `default_volume` seeds the volume slider.
export function getMusic() {
  return request('/api/music')
}

// Drives the per-sticker sound-effect dropdown. Returns
//   { sounds: [{ id, label, path, description }] }
export function getSounds() {
  return request('/api/sounds')
}

// Direct URL to a sound effect's raw audio file, for the preview play button.
export function soundAudioUrl(soundId) {
  return `${API_BASE}/api/sounds/${soundId}/audio`
}

// Drives the caption font/colour preset picker. Returns
//   { styles: [{ id, label, font, font_size, bold, primary, outline, description }], default }
export function getCaptionStyles() {
  return request('/api/caption-styles')
}

// Direct URL to a voice's cached short demo sample, for the voice preview
// button. First request per voice synthesizes (and caches); later ones are
// instant.
export function voiceSampleUrl(voiceId) {
  return `${API_BASE}/api/voices/${voiceId}/sample`
}

// Run ONLY the voice stage to measure the real narration, so the Canva-like
// timeline can be drawn against true seconds. Returns
//   { duration, words: [{ word, start, end }], probe_id }
// `words` powers the voice strip (what's spoken when); `probe_id` is the handle
// for probeAudioUrl() below (playback + waveform).
export function probeDuration({ text, voice, speed, voiceDescription }) {
  return request('/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // voice_description matters for Parler voices so the probe synthesizes the
    // SAME audio the full render will (the backend reuses it). Edge ignores it.
    body: JSON.stringify({ text, voice, speed, voice_description: voiceDescription }),
  })
}

// Direct URL to a probe's synthesized narration mp3 (not fetched as JSON). Drop
// it into an <audio src> for scrubbable playback, or fetch()+decodeAudioData it
// to draw the waveform. Backend serves it from the throwaway probe dir.
export function probeAudioUrl(probeId) {
  return `${API_BASE}/api/probe/${probeId}/audio`
}

// Start a pipeline run. Returns { id }. The backend does the work in the
// background; poll getJob(id) for progress.
// Start a pipeline run. Because we now upload image FILES, this is a MULTIPART
// request: a `payload` part (JSON string of all metadata) + one `files` part per
// used image. We pass each file with its `key` as the filename so the backend
// saves it under exactly the name the placements reference.
//
// NOTE: we do NOT set Content-Type — the browser sets multipart/form-data with
// the correct boundary automatically when the body is a FormData.
export function createJob({
  text,
  voice,
  voiceDescription,
  speed,
  clip,
  background,
  split,
  stickers,
  showOutro,
  music,
  musicVolume,
  captionStyle,
  introVideo = null,
  outroVideo = null,
  files = [],
}) {
  const form = new FormData()
  form.append(
    'payload',
    JSON.stringify({
      text,
      voice,
      // Parler style prompt. Sent for every voice; the backend ignores it for
      // edge voices and falls back to the voice's default when empty.
      voice_description: voiceDescription,
      speed,
      clip,
      background,
      split,
      // Each placement already carries full_width/animation/animation_duration/
      // sound_id alongside the original image/start/end/x/y — no transform needed.
      stickers,
      show_outro: showOutro,
      // Background-music registry id (null = no music) + how loud it sits under
      // the narration. The backend maps the id to a file and does the mix.
      music: music || null,
      music_volume: musicVolume,
      // Caption style preset registry id (font/size/weight/colours).
      caption_style: captionStyle,
      // Intro/outro video wrap filenames (the clip files ride in `files` below,
      // keyed by these same names). null = not used.
      intro_video: introVideo,
      outro_video: outroVideo,
    }),
  )
  for (const f of files) {
    form.append('files', f.file, f.key)
  }
  return request('/api/generate', { method: 'POST', body: form })
}

export function getJob(id) {
  return request(`/api/jobs/${id}`)
}

// Not fetched as JSON — this is a direct URL you can drop into <video src> or an
// <a download> href. The browser streams the mp4 from the backend.
export function videoUrl(id) {
  return `${API_BASE}/api/jobs/${id}/video`
}
