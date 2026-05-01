'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Calendar } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn, formatShortDate } from '@/lib/utils'

interface SlotRow {
  id:        string
  datetime:  string
  available: boolean
  bookedBy:  string | null
}

const DEFAULT_TIMES = ['10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00']

export function SlotManager() {
  const [slots,    setSlots]    = useState<SlotRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Bulk create form state
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set(DEFAULT_TIMES))
  const [customTime,    setCustomTime]    = useState('')

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/slots')
      if (res.status === 401) {
        window.location.href = '/admin/login?from=/admin/slots'
        return
      }
      const data = await res.json() as { slots: SlotRow[] }
      setSlots(data.slots ?? [])
    } catch {
      toast.error('Error al cargar slots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  // Generate next 14 days for quick date picking
  const nextDays = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(startOfDay(new Date()), i + 1)
    return format(d, 'yyyy-MM-dd')
  })

  const toggleDate = (d: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }

  const toggleTime = (t: string) => {
    setSelectedTimes(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  const addCustomTime = () => {
    if (!customTime.match(/^\d{2}:\d{2}$/)) return
    setSelectedTimes(prev => new Set([...prev, customTime]))
    setCustomTime('')
  }

  const createSlots = useCallback(async () => {
    if (!selectedDates.size || !selectedTimes.size) {
      toast.error('Selecciona al menos una fecha y un horario')
      return
    }
    setCreating(true)
    try {
      const res  = await fetch('/api/admin/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: [...selectedDates],
          times: [...selectedTimes],
        }),
      })
      const data = await res.json() as { created: number; skipped: string[] }
      toast.success(`${data.created} slot${data.created !== 1 ? 's' : ''} creado${data.created !== 1 ? 's' : ''}`)
      setShowAdd(false)
      setSelectedDates(new Set())
      fetchSlots()
    } catch {
      toast.error('Error al crear slots')
    } finally {
      setCreating(false)
    }
  }, [selectedDates, selectedTimes, fetchSlots])

  const deleteSlot = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/slots?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error)
      }
      toast.success('Slot eliminado')
      setSlots(prev => prev.filter(s => s.id !== id))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(null)
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-ink">Slots disponibles</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Agregar slots
        </Button>
      </div>

      {/* Slots list */}
      <div className="overflow-x-auto rounded-2xl border border-stone-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              {['Fecha y hora', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-ink-muted tracking-widest uppercase font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-ink-muted">Cargando…</td></tr>
            )}
            {!loading && slots.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-ink-muted">Sin slots creados</td></tr>
            )}
            {slots.map(slot => (
              <tr key={slot.id} className="border-b border-stone-100 hover:bg-cream-soft transition-colors">
                <td className="px-4 py-3 text-ink">
                  {formatShortDate(slot.datetime)}
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    slot.available
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-stone-100 text-stone-500 border border-stone-200',
                  )}>
                    {slot.available ? 'Disponible' : 'Reservado'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {slot.available && (
                    <button
                      onClick={() => deleteSlot(slot.id)}
                      disabled={deleting === slot.id}
                      className="text-red-400/60 hover:text-red-500 transition-colors disabled:opacity-40"
                      aria-label="Eliminar slot"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add slots modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Agregar slots" size="lg">
        <div className="space-y-5">
          <div>
            <p className="label-clean mb-3">Selecciona fechas</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {nextDays.map(d => {
                const date    = new Date(d + 'T12:00:00')
                const isSel   = selectedDates.has(d)
                return (
                  <button
                    key={d}
                    onClick={() => toggleDate(d)}
                    className={cn(
                      'flex flex-col items-center py-2 px-1 rounded-xl text-xs border transition-all',
                      isSel
                        ? 'bg-champagne text-white border-champagne shadow-pop'
                        : 'border-stone-200 text-ink hover:border-champagne hover:bg-cream-soft',
                    )}
                  >
                    <span className="uppercase opacity-70">{format(date, 'EEE', { locale: es })}</span>
                    <span className="font-semibold text-sm mt-0.5">{format(date, 'd')}</span>
                    <span className="opacity-70">{format(date, 'MMM', { locale: es })}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="label-clean mb-3">Selecciona horarios</p>
            <div className="flex flex-wrap gap-2">
              {[...selectedTimes].sort().map(t => (
                <button
                  key={t}
                  onClick={() => toggleTime(t)}
                  className="px-3 py-1.5 rounded-lg text-sm border bg-champagne text-white border-champagne"
                >
                  {t} ✕
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                placeholder="HH:MM"
                className="input-clean w-24"
                pattern="\d{2}:\d{2}"
              />
              <Button variant="outline" size="sm" onClick={addCustomTime}>
                <Plus size={14} /> Agregar hora
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-stone-100">
            <p className="text-xs text-ink-muted">
              {selectedDates.size} fecha{selectedDates.size !== 1 ? 's' : ''} ×{' '}
              {selectedTimes.size} horario{selectedTimes.size !== 1 ? 's' : ''} ={' '}
              <strong className="text-champagne">{selectedDates.size * selectedTimes.size} slots</strong>
            </p>
            <Button loading={creating} onClick={createSlots}>
              <Calendar size={14} /> Crear slots
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
