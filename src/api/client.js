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

export function getCanvases() {
  return request('/api/canvases')
}

// Drives the outro-card picker. Returns
//   { outros: [{ id, label, path, canvas, description }],
//     defaults: { <canvas id>: <outro id> }, seconds_choices, default_seconds,
//     min_seconds, max_seconds }
// Every card that exists on disk comes back at once (each tagged with the
// canvas its artwork was made for), so switching aspect ratio just re-filters
// the list client-side instead of re-fetching.
export function getOutros() {
  return request('/api/outros')
}

// Direct URL to an outro card's image, for the picker's thumbnail — same
// pattern as characterImageUrl.
export function outroImageUrl(outroId) {
  return `${API_BASE}/api/outros/${outroId}/image`
}

// Drives the background-music dropdown. Returns
//   { music: [{ id, label, path, artist, mood, description }], default, default_volume }
// `default` is null (no music) and `default_volume` seeds the volume slider.
export function getMusic() {
  return request('/api/music')
}

// Direct URL to a background-music track's raw audio file, for the preview
// play button — same pattern as soundAudioUrl.
export function musicAudioUrl(musicId) {
  return `${API_BASE}/api/music/${musicId}/audio`
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
//   { styles: [{ id, label, font, font_size, bold, primary, outline, box, description }], default }
export function getCaptionStyles() {
  return request('/api/caption-styles')
}

// Drives the caption vertical-position picker (Feature: adjustable caption
// placement). Returns
//   { positions: [{ id, label, y_fraction, description }], default }
export function getCaptionPositions() {
  return request('/api/caption-positions')
}

// Direct URL to a voice's cached short demo sample, for the voice preview
// button. First request per voice synthesizes (and caches); later ones are
// instant.
export function voiceSampleUrl(voiceId) {
  return `${API_BASE}/api/voices/${voiceId}/sample`
}

// Drives the word-pop caption controls. Returns
//   { animations: [{ id, label, description }], default,
//     highlights: [{ id, label, ass, css }], default_highlight,
//     densities:  [{ id, label, min_words, max_words, description }], default_density }
// Every registry includes the entry that reproduces the original whole-line
// captions ("off" / "full"), so the picker can always get back to it.
export function getCaptionAnimations() {
  return request('/api/caption-animations')
}

// Drives the scene-image motion controls. Returns
//   { transitions: [{ id, label, description }], default_transition,
//     default_seconds, min_seconds, max_seconds,
//     ken_burns: [{ id, label, zoom }], default_ken_burns }
export function getMotionOptions() {
  return request('/api/motion')
}

// --- AI scene images (optional feature) ------------------------------------
// Drives the image-style selector + count control. Returns
//   { styles: [{ id, label, prompt_suffix, description }], default,
//     default_count, min_count, max_count }
export function getImageStyles() {
  return request('/api/image-styles')
}

// Drives the image-provider picker. Returns
//   { providers: [{ id, label, description, available, unavailable_reason,
//                   supports_reference, speed, chain?, usable_chain? }], default }
// `available` is computed server-side from each backend's required env vars, so
// an unconfigured provider can be disabled with a real reason instead of failing
// on the first image. `supports_reference` is false for backends that cannot use
// a saved character's reference image — those will not keep a character's look.
export function getImageProviders() {
  return request('/api/image-providers')
}

// Ask the LLM how many scene images would suit this script — purely advisory,
// shown to the user BEFORE they commit to a count. `duration` (seconds, from
// probeDuration()) is optional; the suggestion still works from script length
// alone if the timeline hasn't been loaded yet. Returns { count, min_count, max_count }.
export function suggestImageCount({ text, duration }) {
  return request('/api/scenes/suggest-count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration: duration || null }),
  })
}

// Kick off AI scene-image generation. `duration` is the real narration length in
// SECONDS from probeDuration(). `referenceFile` (optional File) is an image the
// whole batch takes inspiration from. `characterId` (optional, from
// getCharacters()) picks a saved character's reference + description instead —
// ignored if `referenceFile` is also set (an ad-hoc upload wins). Returns
// { id }; poll getSceneJob(id).
//
// Multipart (same pattern as createJob): a `payload` JSON part + an optional
// `reference` file part. No Content-Type header — the browser sets the
// multipart boundary itself for FormData bodies.
export function generateScenes({
  text, duration, style, count, split, canvas, words = [], referenceFile = null, characterId = null,
  worldId = null, imageProvider = null,
}) {
  const form = new FormData()
  // `split`/`canvas` (Feature: Full-size image mode + 16:9 support) tell the
  // backend the target aspect so it can request images sized to match instead
  // of a fixed square — see backend/config.py's resolve_canvas_split().
  // `words`: real per-word timestamps from /api/probe — lets the backend anchor
  // each generated image to the moment its content is actually spoken instead
  // of an LLM-guessed proportional split (see groq_provider.py).
  // `world_id`: an optional saved world (see getWorlds() below) — orthogonal
  // to character_id, grounds this batch's scenes + visual style in a
  // franchise setting (Naruto, Attack on Titan, ...).
  form.append(
    'payload',
    // `image_provider`: which backend renders this batch (see
    // getImageProviders()). null = the server's configured default.
    JSON.stringify({
      text, duration, style, count, split, canvas, words,
      character_id: characterId, world_id: worldId, image_provider: imageProvider,
    }),
  )
  if (referenceFile) form.append('reference', referenceFile, referenceFile.name)
  return request('/api/scenes/generate', { method: 'POST', body: form })
}

// Poll target for scene-image generation. Returns
//   { id, status, stage, done, total, style, error,
//     scenes: [{ image, prompt, start, end, url }] }
// (url is a RELATIVE path; use sceneImageUrl() to get a fetchable absolute URL.)
export function getSceneJob(id) {
  return request(`/api/scenes/${id}`)
}

// Absolute URL to a generated scene PNG — drop into an <img src>. The timeline
// references the image itself as "generated:<id>/<name>" (a placement `image`),
// which the backend resolves at render time.
export function sceneImageUrl(id, name) {
  return `${API_BASE}/api/scenes/${id}/images/${name}`
}

// --- Persistent character library -------------------------------------------
// Save a recurring character (mascot) ONCE — master reference image +
// description — and reuse it across any future AI scene-image generation via
// generateScenes({ characterId }) instead of re-uploading a reference per job.

// Drives the character picker. Returns
//   { characters: [{ id, name, description, style, seed, source, image_url, created_at }] }
export function getCharacters() {
  return request('/api/characters')
}

// Save a new character. Either upload your own master reference image
// (`imageFile`, e.g. from Midjourney) or omit it to have the backend render
// ONE image from `description` (+ `style`) via the configured image
// provider — same free-Colab-T4 path as scene-image generation, so this can
// take ~15-45s. Returns the saved CharacterOut.
//
// Multipart (same pattern as generateScenes): a `payload` JSON part + an
// optional `image` file part.
export function createCharacter({ name, description, style, seed = null, imageFile = null }) {
  const form = new FormData()
  form.append('payload', JSON.stringify({ name, description, style, seed }))
  if (imageFile) form.append('image', imageFile, imageFile.name)
  return request('/api/characters', { method: 'POST', body: form })
}

export function deleteCharacter(id) {
  return request(`/api/characters/${id}`, { method: 'DELETE' })
}

// Absolute URL to a saved character's master reference PNG.
export function characterImageUrl(id) {
  return `${API_BASE}/api/characters/${id}/image`
}

// --- Persistent world library -----------------------------------------------
// Save a franchise/setting's visual style + iconic-location text ONCE and
// reuse it across any future AI scene-image generation via
// generateScenes({ worldId }). Orthogonal to characters: a character is WHO
// is on screen, a world is WHERE/what it looks like — both may be set
// together.

// Drives the world picker. Returns
//   { worlds: [{ id, name, style_suffix, setting_description, source, created_at }] }
export function getWorlds() {
  return request('/api/worlds')
}

// Save a new world. Plain JSON body — unlike createCharacter(), there's no
// file to upload/generate, so no multipart/FormData is needed. Returns the
// saved WorldOut.
export function createWorld({ name, styleSuffix, settingDescription }) {
  return request('/api/worlds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, style_suffix: styleSuffix, setting_description: settingDescription,
    }),
  })
}

export function deleteWorld(id) {
  return request(`/api/worlds/${id}`, { method: 'DELETE' })
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
  canvas,
  stickers,
  showOutro,
  outro,
  outroSeconds,
  music,
  musicVolume,
  captionStyle,
  captionPosition,
  captionsEnabled = true,
  captionAnimation,
  captionHighlight,
  captionDensity,
  imageTransition,
  transitionSeconds,
  kenBurns,
  seed = null,
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
      // Canvas/aspect-ratio registry id (Feature: 16:9 support). "landscape"
      // always renders full-screen server-side regardless of `split` — see
      // backend/config.py's resolve_canvas_split().
      canvas,
      // Each placement already carries full_width/animation/animation_duration/
      // sound_id alongside the original image/start/end/x/y — no transform needed.
      stickers,
      show_outro: showOutro,
      // Which outro card to append (registry id from /api/outros; null = the
      // canvas's default card) and how long it holds on screen.
      outro: outro || null,
      outro_seconds: outroSeconds,
      // Background-music registry id (null = no music) + how loud it sits under
      // the narration. The backend maps the id to a file and does the mix.
      music: music || null,
      music_volume: musicVolume,
      // Caption style preset registry id (font/size/weight/colours).
      caption_style: captionStyle,
      // Caption vertical position registry id (Feature: adjustable caption
      // placement — top/center/bottom within the caption region).
      caption_position: captionPosition,
      // Subtitle on/off toggle. Off skips the captions pipeline stage entirely
      // on the backend, not just the burn-in.
      captions_enabled: captionsEnabled,
      // Motion & caption animation. All optional server-side with registry
      // defaults, so omitting any of them is safe.
      caption_animation: captionAnimation,
      caption_highlight: captionHighlight,
      caption_density: captionDensity,
      image_transition: imageTransition,
      transition_seconds: transitionSeconds,
      ken_burns: kenBurns,
      // Gameplay-trim seed. null means "derive a stable one from the settings";
      // a restored project sends back the seed it was rendered with, so
      // re-rendering it reproduces the same trim instead of re-rolling.
      seed,
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

// --- Recent projects / reopen-for-editing -----------------------------------
// The last KEEP_LAST_N_RENDER_JOBS successfully-finished renders. Returns
//   [{ id, text_preview, created_at, duration, has_video }, ...] newest first.
export function getRecentJobs() {
  return request('/api/jobs')
}

// The resolved settings a past render was made with (pipeline.py's project.json).
// Used to repopulate the editor when the user picks a job from "Recent projects".
export function getJobProject(id) {
  return request(`/api/jobs/${id}/project`)
}

// The real measured duration + per-word timings from a past render — lets a
// restored project populate the timeline WITHOUT a fresh /api/probe call (no
// resynthesis just to reopen a project). Returns { duration, words }.
export function getJobTimestamps(id) {
  return request(`/api/jobs/${id}/timestamps`)
}

// Direct URL to a past render's narration mp3, for the restored voice-strip
// playback/waveform — same pattern as probeAudioUrl.
export function jobAudioUrl(id) {
  return `${API_BASE}/api/jobs/${id}/audio`
}

// Direct URL to a file in a past render's stickers/ dir (uploaded image, AI image
// copy, or intro/outro video) — used to preview a restored placement's image
// without re-uploading it.
export function jobStickerUrl(id, name) {
  return `${API_BASE}/api/jobs/${id}/stickers/${name}`
}
