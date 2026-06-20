// useGenerationJob.js
// -------------------
// Encapsulates the "start a job, then poll it until done/error" lifecycle so
// App.jsx stays declarative. Components get a simple state machine:
//
//   phase: 'idle' | 'submitting' | 'running' | 'done' | 'error'
//
// plus the latest job snapshot from the backend (status, stage, per-stage
// states, duration, has_video) and any error message.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createJob, getJob } from '../api/client'

const POLL_MS = 1000

export function useGenerationJob() {
  const [phase, setPhase] = useState('idle')
  const [job, setJob] = useState(null) // latest snapshot from GET /api/jobs/{id}
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  // Clear any pending poll timer (on stop, unmount, or restart).
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const poll = useCallback(
    async (id) => {
      try {
        const snapshot = await getJob(id)
        setJob(snapshot)

        if (snapshot.status === 'done') {
          setPhase('done')
          return
        }
        if (snapshot.status === 'error') {
          setError(snapshot.error ?? 'Generation failed.')
          setPhase('error')
          return
        }
        // still queued/running — schedule the next poll.
        timerRef.current = setTimeout(() => poll(id), POLL_MS)
      } catch (err) {
        setError(err.message)
        setPhase('error')
      }
    },
    [],
  )

  // Kick off a new generation. `options` = { text, voice, speed, clip }.
  const start = useCallback(
    async (options) => {
      clearTimer()
      setError(null)
      setJob(null)
      setPhase('submitting')
      try {
        const { id } = await createJob(options)
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
