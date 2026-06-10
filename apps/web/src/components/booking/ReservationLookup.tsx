'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'

export function ReservationLookup() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setDone(false)
    try {
      const res = await fetch('/api/reserva/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, code }),
      })
      const json = await res.json() as { error?: string; message?: string }
      if (!res.ok) throw new Error(json.error ?? 'No se pudo buscar la cita')
      setDone(true)
      toast.success(json.message ?? 'Te enviamos el link si encontramos una cita.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo buscar la cita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card variant="atelier" className="w-full max-w-md p-5 sm:p-7">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="h-eyebrow mb-2">Consulta</p>
          <h1 className="font-serif text-3xl font-light text-ink">Ver mi reserva</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Escribe tu correo o teléfono y, si lo tienes, tu código. Te enviaremos el link seguro para revisar tu cita.
          </p>
        </div>

        <Field label="Correo electrónico">
          {(id, ariaProps) => (
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                id={id}
                {...ariaProps}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-clean pl-9"
                placeholder="maria@ejemplo.com"
                autoComplete="email"
              />
            </div>
          )}
        </Field>

        <Field label="Teléfono">
          {(id, ariaProps) => (
            <input
              id={id}
              {...ariaProps}
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="input-clean"
              placeholder="+52 55 1234 5678"
              autoComplete="tel"
            />
          )}
        </Field>

        <Field label="Código de referencia">
          {(id, ariaProps) => (
            <input
              id={id}
              {...ariaProps}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="input-clean font-mono uppercase tracking-widest"
              placeholder="ABCD2345"
            maxLength={12}
          />
        )}
      </Field>

        <p className="text-xs leading-5 text-ink-subtle">
          Por seguridad, si usas teléfono y tienes tu código de referencia, lo validamos contra ambos datos.
        </p>

        {done && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            Listo. Si encontramos una cita con esos datos, el link llegará al email de la reserva.
          </p>
        )}

        <Button type="submit" loading={loading} className="w-full">
          <Search size={15} strokeWidth={1.5} /> Buscar reserva
        </Button>
      </form>
    </Card>
  )
}
