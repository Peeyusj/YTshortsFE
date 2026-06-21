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

export function getStickers() {
  return request('/api/stickers')
}

// Absolute URL for a sticker image (the list returns a relative `url`). Use it
// directly in <img src>.
export function stickerUrl(sticker) {
  return `${API_BASE}${sticker.url}`
}

// Run ONLY the voice stage to measure the real audio duration, so the sticker
// timeline can be drawn against true seconds. Returns { duration }.
export function probeDuration({ text, voice, speed }) {
  return request('/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  })
}

// Start a pipeline run. Returns { id }. The backend does the work in the
// background; poll getJob(id) for progress.
export function createJob({
  text,
  voice,
  speed,
  clip,
  background,
  split,
  stickers,
  showOutro,
}) {
  return request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice,
      speed,
      clip,
      background,
      split,
      stickers,
      show_outro: showOutro,
    }),
  })
}

export function getJob(id) {
  return request(`/api/jobs/${id}`)
}

// Not fetched as JSON — this is a direct URL you can drop into <video src> or an
// <a download> href. The browser streams the mp4 from the backend.
export function videoUrl(id) {
  return `${API_BASE}/api/jobs/${id}/video`
}
