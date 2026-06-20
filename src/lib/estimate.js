// estimate.js
// -----------
// Rough, pre-generation duration estimate so the user gets an early warning if
// a script is likely to blow past the 60s Shorts limit. This is intentionally
// approximate — the backend returns the REAL measured duration after the voice
// stage, and the UI replaces this estimate with that.

// Average narration pace at normal (1.0x) speed, in words per minute. edge_tts
// Indian-English voices land roughly here; the speed multiplier scales it.
const BASE_WPM = 150

// YouTube Shorts hard limit.
export const MAX_SECONDS = 60

export function countWords(text) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

// Estimated spoken length in seconds for `text` at the given speed multiplier.
// effective wpm = BASE_WPM * speed  ->  seconds = words / (wpm / 60).
export function estimateSeconds(text, speed = 1.0) {
  const words = countWords(text)
  const wpm = BASE_WPM * speed
  return (words / wpm) * 60
}

export function isLikelyTooLong(text, speed = 1.0) {
  return estimateSeconds(text, speed) > MAX_SECONDS
}
