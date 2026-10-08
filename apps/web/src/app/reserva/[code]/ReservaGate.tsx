'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'

/**
 * Puerta de /reserva/[code] para enlaces sin firma (correos viejos o códigos
 * compartidos). No muestra ningún dato de la cita ni confirma que exista: pide
 * el correo con el que se reservó y el servidor decide.
 */
export default function ReservaGate({ code }: { code: string }) {
  const router = useRouter()
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Escribe el correo con el que reservaste.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/reserva/${encodeURIComponent(code)}/acceso`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'No pudimos verificar esos datos.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos verificar esos datos.')
      setLoading(false)
    }
  }

  return (
    <Card variant="atelier" className="w-full max-w-md p-6 sm:p-7">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <p className="h-eyebrow mb-2 inline-flex items-center gap-2">
            <Lock size={12} strokeWidth={1.5} className="text-champagne-solid" aria-hidden />
            Consulta privada
          </p>
          <h2 className="font-serif text-3xl font-light text-ink">Confirma que eres tú</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Para cuidar tus datos, escribe el correo con el que hiciste la reserva. Solo así podrás ver y cambiar tu cita desde este dispositivo.
          </p>
        </div>

        <Field label="Correo electrónico" error={error || undefined}>
          {(id, ariaProps) => (
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <input
                id={id}
                {...ariaProps}
                type="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-clean pl-9"
                placeholder="tu@correo.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
          )}
        </Field>

        <Button type="submit" loading={loading} className="w-full">
          Ver mi cita
        </Button>

        <p className="text-xs leading-5 text-ink-subtle">
          ¿No recuerdas el correo?{' '}
          <a href="/reserva" className="font-medium text-champagne-solid hover:text-champagne-deep">
            Te enviamos el enlace
          </a>
          {' '}o escríbenos a hola@ciaociao.mx.
        </p>
      </form>
    </Card>
  )
}
