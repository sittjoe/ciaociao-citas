'use client'

/**
 * Reusable admin action that lets an operator manually resend an appointment
 * notification via WhatsApp. Intentionally NOT imported anywhere yet — Agente 8
 * is editing the appointment-detail surfaces in parallel and will wire this in
 * to avoid merge collisions. Until then, this file stands on its own.
 *
 * Expects a POST endpoint at /api/admin/appointments/[id]/notify (to be added
 * by Agente 8 / Agente 10) that accepts { channel: 'whatsapp', template } and
 * delegates to `sendWhatsAppMessage` server-side. The endpoint is fine to be
 * 404 for now — the button will surface that as a toast.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export type WhatsAppResendTemplate = 'confirmation' | 'reminder_24h' | 'cancellation'

interface Props {
  appointmentId: string
  template?: WhatsAppResendTemplate
  disabled?: boolean
  label?: string
  onSuccess?: () => void
  className?: string
}

export function WhatsAppResendButton({
  appointmentId,
  template = 'confirmation',
  disabled,
  label = 'Reenviar por WhatsApp',
  onSuccess,
  className,
}: Props) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy || disabled) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'whatsapp', template }),
      })
      if (res.status === 401) {
        window.location.href = '/admin/login'
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const reason = (data && (data.error as string)) || `HTTP ${res.status}`
        if (reason === 'whatsapp_disabled') {
          toast.error('WhatsApp deshabilitado. Revisa ENABLE_WHATSAPP y credenciales de Twilio.')
        } else if (reason === 'invalid_phone') {
          toast.error('El teléfono de la cita no es válido para WhatsApp.')
        } else {
          toast.error(`No se pudo enviar WhatsApp: ${reason}`)
        }
        return
      }
      toast.success('WhatsApp enviado')
      onSuccess?.()
    } catch (err) {
      toast.error('Error de red al enviar WhatsApp')
      console.error('WhatsAppResendButton', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy || disabled}
      className={className}
      aria-label={label}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
      ) : (
        <MessageCircle className="w-4 h-4 mr-2" aria-hidden />
      )}
      {label}
    </Button>
  )
}
