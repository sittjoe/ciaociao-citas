'use client'

import { useRef, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { motion, AnimatePresence } from '@/components/motion'
import { Field } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import { guestInputSchema } from '@/lib/schemas'
import type { GuestInput } from '@/lib/schemas'

interface GuestsFieldProps {
  value:      GuestInput[]
  onChange:   (guests: GuestInput[]) => void
  hostEmail?: string
}

type FieldErrors = { name?: string; email?: string }

const MAX_GUESTS = 3
const EMPTY: GuestInput = { name: '', email: '' }

export function GuestsField({ value, onChange, hostEmail }: GuestsFieldProps) {
  const [errors,   setErrors]   = useState<Record<number, FieldErrors>>({})
  const [guestIds, setGuestIds] = useState<string[]>([])
  const nextGuestId = useRef(0)

  const addGuest = () => {
    if (value.length >= MAX_GUESTS) return
    nextGuestId.current += 1
    setGuestIds(prev => [...prev, `guest-${nextGuestId.current}`])
    onChange([...value, { ...EMPTY }])
  }

  const removeGuest = (i: number) => {
    setGuestIds(prev => prev.filter((_, idx) => idx !== i))
    const nextErrors = { ...errors }
    delete nextErrors[i]
    const reindexed: Record<number, FieldErrors> = {}
    Object.entries(nextErrors).forEach(([k, v]) => {
      const n = Number(k)
      reindexed[n > i ? n - 1 : n] = v
    })
    setErrors(reindexed)
    onChange(value.filter((_, idx) => idx !== i))
  }

  const updateGuest = (i: number, field: keyof GuestInput, v: string) => {
    if (errors[i]?.[field]) {
      setErrors(prev => ({ ...prev, [i]: { ...prev[i], [field]: undefined } }))
    }
    onChange(value.map((g, idx) => idx === i ? { ...g, [field]: v } : g))
  }

  const validateField = (i: number, field: keyof GuestInput) => {
    const guest = value[i]
    if (!guest) return
    const result = guestInputSchema.safeParse(guest)
    const fieldError = result.success ? undefined : result.error.flatten().fieldErrors[field]?.[0]
    let dedupError: string | undefined
    if (field === 'email' && guest.email.trim()) {
      const norm = guest.email.trim().toLowerCase()
      const others = value.filter((_, idx) => idx !== i).map(g => g.email.trim().toLowerCase())
      if (others.includes(norm)) dedupError = 'Este email ya está en otra fila'
      else if (hostEmail && norm === hostEmail.trim().toLowerCase()) dedupError = 'No puede ser el mismo email que el titular'
    }
    setErrors(prev => ({ ...prev, [i]: { ...prev[i], [field]: dedupError ?? fieldError } }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">
            Invitados <span className="text-ink-muted font-normal">(opcional)</span>
          </p>
          <p className="text-xs text-ink-muted mt-0.5">
            Hasta {MAX_GUESTS}. Solo personas verificadas pueden ingresar.
          </p>
        </div>
        {value.length > 0 && value.length < MAX_GUESTS && (
          <button
            type="button"
            onClick={addGuest}
            className="flex items-center gap-1.5 text-xs text-champagne hover:text-champagne-deep font-medium transition-colors"
          >
            <UserPlus size={14} strokeWidth={1.5} />
            Agregar
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {value.map((guest, i) => (
          <motion.div
            key={guestIds[i] ?? i}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="p-3 bg-cream-soft border border-ink-line rounded-xl space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[0.6rem] text-ink-muted font-semibold tracking-[0.18em] uppercase">
                  Invitado {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeGuest(i)}
                  className="text-ink-muted hover:text-red-500 transition-colors"
                  aria-label={`Quitar invitado ${i + 1}`}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>

              <Field label="Nombre" error={errors[i]?.name}>
                {(id, ariaProps) => (
                  <input
                    id={id}
                    {...ariaProps}
                    value={guest.name}
                    onChange={e => updateGuest(i, 'name', e.target.value)}
                    onBlur={() => validateField(i, 'name')}
                    className={cn('input-clean', errors[i]?.name && 'border-red-300')}
                    placeholder="Ana García"
                    autoComplete="off"
                  />
                )}
              </Field>

              <Field label="Email" error={errors[i]?.email}>
                {(id, ariaProps) => (
                  <input
                    id={id}
                    {...ariaProps}
                    value={guest.email}
                    onChange={e => updateGuest(i, 'email', e.target.value)}
                    onBlur={() => validateField(i, 'email')}
                    type="email"
                    className={cn('input-clean', errors[i]?.email && 'border-red-300')}
                    placeholder="ana@ejemplo.com"
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {value.length === 0 && (
        <button
          type="button"
          onClick={addGuest}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                     border-2 border-dashed border-ink-line
                     hover:border-champagne hover:bg-champagne-soft/30
                     text-ink-muted hover:text-champagne text-sm transition-all duration-200"
        >
          <UserPlus size={16} strokeWidth={1.5} />
          Agregar invitado
        </button>
      )}
    </div>
  )
}
