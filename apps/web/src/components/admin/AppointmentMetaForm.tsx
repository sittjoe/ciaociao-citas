'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Star, UserPlus, Repeat, Tag, X, Save, History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import type { AppointmentType } from '@/types'

interface NoteHistoryEntry {
  id: string
  notes: string
  updatedAt: string
  updatedBy: string
}

interface Props {
  appointmentId: string
  initialTags?: string[]
  initialType?: AppointmentType | null
  initialNotes?: string
  initialNotesUpdatedAt?: string | null
  initialNotesUpdatedBy?: string | null
  onSaved?: () => void
}

const TYPE_OPTIONS: { value: AppointmentType; label: string; Icon: typeof Star }[] = [
  { value: 'vip',        label: 'VIP',         Icon: Star    },
  { value: 'first-time', label: 'Primera vez', Icon: UserPlus },
  { value: 'returning',  label: 'Recurrente',  Icon: Repeat  },
  { value: 'other',      label: 'Otro',        Icon: Tag     },
]

export function AppointmentMetaForm({
  appointmentId,
  initialTags = [],
  initialType = null,
  initialNotes = '',
  initialNotesUpdatedAt = null,
  initialNotesUpdatedBy = null,
  onSaved,
}: Props) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [tagDraft, setTagDraft] = useState('')
  const [type, setType] = useState<AppointmentType | null>(initialType)
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<NoteHistoryEntry[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Re-seed when switching between appointments inside the same modal.
  useEffect(() => {
    setTags(initialTags)
    setType(initialType)
    setNotes(initialNotes)
    setTagDraft('')
    setHistoryOpen(false)
    setHistory(null)
  }, [appointmentId, initialTags, initialType, initialNotes])

  const dirty = useMemo(() => {
    const tagsEqual =
      tags.length === initialTags.length &&
      tags.every((t, i) => t === initialTags[i])
    return !tagsEqual || type !== initialType || notes !== initialNotes
  }, [tags, type, notes, initialTags, initialType, initialNotes])

  const addTag = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    if (t.length > 32) {
      toast.error('Etiqueta demasiado larga')
      return
    }
    const key = t.toLowerCase()
    if (tags.some(x => x.toLowerCase() === key)) {
      setTagDraft('')
      return
    }
    if (tags.length >= 12) {
      toast.error('Máximo 12 etiquetas')
      return
    }
    setTags(prev => [...prev, t])
    setTagDraft('')
  }

  const removeTag = (t: string) => {
    setTags(prev => prev.filter(x => x !== t))
  }

  const onTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagDraft)
    } else if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags,
          type: type ?? null,
          internalNotes: notes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'No se pudo guardar')
      }
      toast.success('Cambios guardados')
      // If history was open, refresh it so the new entry shows up.
      if (historyOpen) loadHistory()
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/meta`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { history: NoteHistoryEntry[] }
      setHistory(data.history)
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && history === null) loadHistory()
  }

  const noteLen = notes.length

  return (
    <div className="space-y-4 rounded-2xl border border-admin-line bg-admin-surface/60 p-4">
      <div className="flex items-center justify-between">
        <p className="h-eyebrow">Metadatos internos</p>
        {(initialNotesUpdatedAt || initialNotesUpdatedBy) && (
          <p className="text-[0.65rem] text-ink-subtle">
            Notas actualizadas {initialNotesUpdatedBy ? `por ${initialNotesUpdatedBy}` : ''}
          </p>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="label-clean">Tipo de cliente</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {TYPE_OPTIONS.map(({ value, label, Icon }) => {
            const active = type === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setType(active ? null : value)}
                aria-pressed={active}
                className={
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring ' +
                  (active
                    ? 'border-champagne bg-champagne-tint text-champagne-deep'
                    : 'border-admin-line bg-admin-panel text-ink-muted hover:text-ink')
                }
              >
                <Icon size={12} strokeWidth={1.75} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="label-clean" htmlFor={`tag-input-${appointmentId}`}>
          Etiquetas
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-admin-line bg-white px-2 py-1.5">
          {tags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-champagne-tint px-2 py-0.5 text-xs text-champagne-deep border border-champagne-soft"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Quitar etiqueta ${t}`}
                className="hover:text-red-500 transition-colors"
              >
                <X size={10} strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            id={`tag-input-${appointmentId}`}
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={() => tagDraft && addTag(tagDraft)}
            placeholder={tags.length === 0 ? 'Agregar etiqueta y Enter…' : ''}
            className="min-w-[8rem] flex-1 bg-transparent text-xs outline-none placeholder:text-ink-subtle"
          />
        </div>
        <p className="mt-1 text-[0.65rem] text-ink-subtle">Enter o coma para agregar · Backspace para quitar la última</p>
      </div>

      {/* Internal notes */}
      <div>
        <div className="flex items-center justify-between">
          <label className="label-clean" htmlFor={`notes-${appointmentId}`}>Notas internas</label>
          <span className={'text-[0.65rem] ' + (noteLen > 2000 ? 'text-red-500' : 'text-ink-subtle')}>
            {noteLen}/2000
          </span>
        </div>
        <Textarea
          id={`notes-${appointmentId}`}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Visible solo para el equipo. Preferencias, alergias, contexto…"
          className="mt-1.5 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleHistory}
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          aria-expanded={historyOpen}
        >
          <History size={12} strokeWidth={1.5} />
          {historyOpen ? 'Ocultar historial' : 'Historial de notas'}
        </button>
        <Button
          variant="gold"
          size="sm"
          loading={saving}
          disabled={!dirty || noteLen > 2000}
          onClick={save}
        >
          <Save size={13} strokeWidth={1.5} /> Guardar
        </Button>
      </div>

      {historyOpen && (
        <div className="rounded-xl border border-admin-line bg-admin-panel p-3">
          {historyLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={16} className="animate-spin text-champagne" />
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-xs text-ink-subtle text-center py-2">Sin entradas previas.</p>
          ) : (
            <ul className="space-y-2">
              {history.map(h => (
                <li key={h.id} className="rounded-lg bg-admin-surface/70 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[0.65rem] text-ink-subtle">
                    <span>{h.updatedBy}</span>
                    <span>
                      {new Date(h.updatedAt).toLocaleString('es-MX', {
                        timeZone: 'America/Mexico_City',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-ink">{h.notes}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
