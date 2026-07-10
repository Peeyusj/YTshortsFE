// Voice dropdown. Options come from the backend (GET /api/voices), so adding a
// voice server-side automatically appears here — no frontend change.
//
// The preview button plays a short cached demo clip (GET /api/voices/{id}/sample)
// so you can hear a voice before committing to a full narration. The backend
// synthesizes-then-caches on the first request per voice, so we show a loading
// state only for that first click; repeat clicks (same or different voices,
// once cached) are effectively instant.
import { useRef, useState } from 'react'
import { voiceSampleUrl } from '../api/client'

export default function VoiceSelect({ voices, value, onChange, disabled }) {
  const audioRef = useRef(null)
  const [previewState, setPreviewState] = useState('idle') // idle | loading | error

  function playPreview() {
    if (!value) return
    if (!audioRef.current) audioRef.current = new Audio()
    const a = audioRef.current
    setPreviewState('loading')
    a.src = voiceSampleUrl(value)
    a.oncanplay = () => setPreviewState('idle')
    a.onerror = () => setPreviewState('error')
    a.play().catch(() => setPreviewState('error'))
  }

  return (
    <div className="space-y-2">
      <label htmlFor="voice" className="block text-sm font-medium text-slate-200">
        Voice
      </label>
      <div className="flex items-center gap-2">
        <select
          id="voice"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || voices.length === 0}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm
                     text-slate-100 focus:border-indigo-500 focus:outline-none
                     focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={playPreview}
          disabled={disabled || !value || previewState === 'loading'}
          title="Preview this voice"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700
                     text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewState === 'loading' ? '…' : '▶'}
        </button>
      </div>
      {previewState === 'error' && (
        <p className="text-xs text-rose-300">Couldn't play a preview for this voice.</p>
      )}
    </div>
  )
}
