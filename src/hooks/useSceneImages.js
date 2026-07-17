// useSceneImages.js
// -----------------
// The scene-image analogue of useGenerationJob: "start image generation, then
// poll until done/error". Keeps the AutoImageGenerator component declarative.
//
//   phase: 'idle' | 'submitting' | 'running' | 'done' | 'error'
//
// plus the latest scene-job snapshot ({ status, stage, done, total, scenes }).

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateScenes, getSceneJob } from '../api/client'

// Images render on a free Colab GPU (tens of seconds each), so poll a bit slower
// than the render job — there's no point hammering it every second.
const POLL_MS = 1500

export function useSceneImages() {
  const [phase, setPhase] = useState('idle')
  const [job, setJob] = useState(null) // latest GET /api/scenes/{id} snapshot
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const poll = useCallback(async (id) => {
    try {
      const snapshot = await getSceneJob(id)
      setJob(snapshot)

      if (snapshot.status === 'done') {
        setPhase('done')
        return
      }
      if (snapshot.status === 'error') {
        setError(snapshot.error ?? 'Image generation failed.')
        setPhase('error')
        return
      }
      timerRef.current = setTimeout(() => poll(id), POLL_MS)
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }, [])

  // options = { text, duration (seconds), style, count }
  const start = useCallback(
    async (options) => {
      clearTimer()
      setError(null)
      setJob(null)
      setPhase('submitting')
      try {
        const { id } = await generateScenes(options)
        setPhase('running')
        poll(id)
      } catch (err) {
        setError(err.message)
        setPhase('error')
      }
    },
    [clearTimer, poll],
  )

  const reset = useCallback(() => {
    clearTimer()
    setPhase('idle')
    setJob(null)
    setError(null)
  }, [clearTimer])

  const isBusy = phase === 'submitting' || phase === 'running'

  return { phase, job, error, isBusy, start, reset }
}
