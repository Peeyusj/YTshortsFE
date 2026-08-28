// WorldLibrary.jsx
// -----------------
// Manage the persistent world library (backend/worlds.py): view saved
// worlds, delete one, or create a new one — name + visual-style suffix +
// setting description, no image (text-only; see backend/worlds.py).
//
// The saved list itself lives in App's `worlds` state (single source of
// truth, shared with AutoImageGenerator's WorldSelect) — this component just
// renders it and calls onChanged() after a create/delete so App re-fetches.

import { useState } from 'react'
import { createWorld, deleteWorld } from '../api/client'

export default function WorldLibrary({ worlds, disabled, onChanged }) {
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [styleSuffix, setStyleSuffix] = useState('')
  const [settingDescription, setSettingDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  function resetForm() {
    setName('')
    setStyleSuffix('')
    setSettingDescription('')
    setCreateError(null)
  }

  async function handleCreate() {
    if (!name.trim() || !styleSuffix.trim() || !settingDescription.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await createWorld({
        name: name.trim(),
        styleSuffix: styleSuffix.trim(),
        settingDescription: settingDescription.trim(),
      })
      resetForm()
      setFormOpen(false)
      onChanged()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await deleteWorld(id)
      onChanged()
    } catch {
      // best-effort — the card just stays put if the delete failed
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-200">
          World library
          <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-normal text-indigo-300">
            AI
          </span>
        </span>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          disabled={disabled}
          className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 disabled:opacity-40"
        >
          {formOpen ? 'Cancel' : '+ New world'}
        </button>
      </div>

      {worlds.length === 0 && !formOpen && (
        <p className="text-xs text-slate-500">
          No saved worlds yet.
        </p>
      )}

      {worlds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {worlds.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-1.5 pr-2"
            >
              <span className="max-w-[10rem] truncate text-xs text-slate-200">{w.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(w.id)}
                disabled={disabled || deletingId === w.id}
                title="Delete world"
                className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
              >
                {deletingId === w.id ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <input
            type="text"
            placeholder="Name (e.g. My Anime Franchise)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                       text-slate-100 focus:border-indigo-500 focus:outline-none
                       focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          <textarea
            placeholder="Visual style — linework, color palette, shading pattern. Overrides the Image style picker whenever this world is selected."
            value={styleSuffix}
            onChange={(e) => setStyleSuffix(e.target.value)}
            disabled={creating}
            rows={2}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                       text-slate-100 focus:border-indigo-500 focus:outline-none
                       focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          <textarea
            placeholder="Setting — iconic locations, landmarks, objects. Grounds every generated scene in this world instead of a generic background."
            value={settingDescription}
            onChange={(e) => setSettingDescription(e.target.value)}
            disabled={creating}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                       text-slate-100 focus:border-indigo-500 focus:outline-none
                       focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />

          {createError && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              {createError}
            </p>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim() || !styleSuffix.trim() || !settingDescription.trim()}
            className="w-full rounded-lg bg-fuchsia-600 py-2 text-sm font-medium text-white
                       transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? 'Saving…' : 'Save world'}
          </button>
        </div>
      )}
    </div>
  )
}
