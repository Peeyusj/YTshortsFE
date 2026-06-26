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

// Run ONLY the voice stage to measure the real audio duration, so the sticker
// timeline can be drawn against true seconds. Returns { duration }.
export function probeDuration({ text, voice, speed, voiceDescription }) {
  return request('/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // voice_description matters for Parler voices so the probe synthesizes the
    // SAME audio the full render will (the backend reuses it). Edge ignores it.
    body: JSON.stringify({ text, voice, speed, voice_description: voiceDescription }),
  })
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
      stickers,
      show_outro: showOutro,
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
