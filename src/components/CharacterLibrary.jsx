// CharacterLibrary.jsx
// ---------------------
// Manage the persistent character library (backend/characters.py): view
// saved characters, delete one, or create a new one — either by uploading a
// master reference image (e.g. from Midjourney or any other tool) or letting
// the backend render one from a text description via the same free-Colab-T4
// path AutoImageGenerator uses for scene images (so this can take ~15-45s).
//
// The saved list itself lives in App's `characters` state (single source of
// truth, shared with AutoImageGenerator's CharacterSelect) — this component
// just renders it and calls onChanged() after a create/delete so App re-fetches.

import { useState } from 'react'
import { characterImageUrl, createCharacter, deleteCharacter } from '../api/client'

export default function CharacterLibrary({ characters, styles, disabled, onChanged }) {
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [style, setStyle] = useState('')
  const [refImage, setRefImage] = useState(null) // { file, url } or null
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  function pickImage(file) {
    if (!file) return
    setRefImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
  }
  function clearImage() {
    setRefImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  function resetForm() {
    setName('')
    setDescription('')
    setStyle('')
    clearImage()
    setCreateError(null)
  }

  async function handleCreate() {
    if (!name.trim() || !description.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await createCharacter({
        name: name.trim(),
        description: description.trim(),
        style: style || undefined,
        imageFile: refImage?.file ?? null,
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
      await deleteCharacter(id)
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
          Character library
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
          {formOpen ? 'Cancel' : '+ New character'}
        </button>
      </div>

      {characters.length === 0 && !formOpen && (
        <p className="text-xs text-slate-500">
          No saved characters yet. Create one (e.g. a recurring mascot) to reuse
          the exact same look across every future video instead of re-uploading
          a reference each time.
        </p>
      )}

      {characters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-1.5 pr-2"
            >
              <img src={characterImageUrl(c.id)} alt={c.name} className="h-9 w-9 rounded object-cover" />
              <span className="max-w-[8rem] truncate text-xs text-slate-200">{c.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                disabled={disabled || deletingId === c.id}
                title="Delete character"
                className="text-xs text-slate-500 hover:text-rose-400 disabled:opacity-40"
              >
                {deletingId === c.id ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <input
            type="text"
            placeholder="Name (e.g. Clever Fox)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                       text-slate-100 focus:border-indigo-500 focus:outline-none
                       focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          <textarea
            placeholder="Description — appearance, clothing, personality. Reused on every future scene to keep the character consistent."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={creating}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                       text-slate-100 focus:border-indigo-500 focus:outline-none
                       focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />

          {!refImage && styles.length > 0 && (
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              disabled={creating}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm
                         text-slate-100 focus:border-indigo-500 focus:outline-none
                         focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}

          {!refImage ? (
            <label
              className={`flex cursor-pointer items-center justify-center rounded-lg border
                          border-dashed border-slate-700 bg-slate-900 p-3 text-xs text-slate-500
                          hover:border-slate-500 hover:text-slate-300
                          ${creating ? 'pointer-events-none opacity-50' : ''}`}
            >
              Optional: upload your own master reference image (else AI generates
              one from the description)
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={creating}
                onChange={(e) => {
                  pickImage(e.target.files?.[0])
                  e.target.value = '' // allow re-picking the same file later
                }}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-2">
              <img src={refImage.url} alt="reference" className="h-12 w-12 rounded object-cover" />
              <span className="flex-1 truncate text-xs text-slate-400">{refImage.file.name}</span>
              <button
                onClick={clearImage}
                disabled={creating}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300
                           hover:bg-slate-800 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}

          {createError && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              {createError}
            </p>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim() || !description.trim()}
            className="w-full rounded-lg bg-fuchsia-600 py-2 text-sm font-medium text-white
                       transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating
              ? refImage
                ? 'Saving…'
                : 'Generating reference image… (~15-45s)'
              : 'Save character'}
          </button>
        </div>
      )}
    </div>
  )
}
