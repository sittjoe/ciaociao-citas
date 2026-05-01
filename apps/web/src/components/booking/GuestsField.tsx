'use client'

import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Field } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import type { GuestInput } from '@/lib/schemas'

interface GuestsFieldProps {
  value: GuestInput[]
  onChange: (guests: GuestInput[]) => void
}

const MAX_GUESTS = 3
const EMPTY: GuestInput = { name: '', email: '' }

export function GuestsField({ value, onChange }: GuestsFieldProps) {
  const [errors, setErrors] = useState<Record<number, { name?: string; email?: string }>>({})

  const addGuest = () => {
    if (value.length >= MAX_GUESTS) return
    onChange([...value, { ...EMPTY }])
  }

  const removeGuest = (i: number) => {
    const next = value.filter((_, idx) => idx !== i)
    const nextErrors = { ...errors }
    delete nextErrors[i]
    setErrors(nextErrors)
    onChange(next)
  }

  const updateGuest = (i: number, field: keyof GuestInput, v: string) => {
    const next = value.map((g, idx) => idx === i ? { ...g, [field]: v } : g)
    if (errors[i]?.[field]) {
      setErrors(prev => ({ ...prev, [i]: { ...prev[i], [field]: undefined } }))
    }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Invitados <span className="text-ink-muted font-normal">(opcional)</span></p>
          <p className="text-xs text-ink-muted mt-0.5">Hasta {MAX_GUESTS}. Solo personas verificadas pueden ingresar.</p>
        </div>
        {value.length < MAX_GUESTS && (
          <button
            type="button"
            onClick={addGuest}
            className="flex items-center gap-1.5 text-xs text-champagne hover:text-champagne-deep font-medium transition-colors"
          >
            <UserPlus size={14} />
            Agregar
          </button>
        )}
      </div>

      {value.length > 0 && (
        <div className="space-y-3">
          {value.map((guest, i) => (
            <div
              key={i}
              className="p-3 bg-cream-soft border border-stone-100 rounded-xl space-y-2.5"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-ink-muted font-semibold tracking-wide uppercase">Invitado {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeGuest(i)}
                  className="text-ink-muted hover:text-red-500 transition-colors"
                  aria-label={`Quitar invitado ${i + 1}`}
                >
                  <X size={14} />
                </button>
              </div>

              <Field label="Nombre" error={errors[i]?.name}>
                <input
                  value={guest.name}
                  onChange={e => updateGuest(i, 'name', e.target.value)}
                  className={cn('input-clean', errors[i]?.name && 'border-red-300')}
                  placeholder="Ana García"
                  autoComplete="off"
                />
              </Field>

              <Field label="Email" error={errors[i]?.email}>
                <input
                  value={guest.email}
                  onChange={e => updateGuest(i, 'email', e.target.value)}
                  type="email"
                  className={cn('input-clean', errors[i]?.email && 'border-red-300')}
                  placeholder="ana@ejemplo.com"
                  autoComplete="off"
                />
              </Field>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <button
          type="button"
          onClick={addGuest}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-stone-200 hover:border-champagne hover:bg-champagne-soft/30 text-ink-muted hover:text-champagne text-sm transition-all duration-200"
        >
          <UserPlus size={16} />
          Agregar invitado
        </button>
      )}
    </div>
  )
}
