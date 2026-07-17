'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertDialog } from '@/components/ui/AlertDialog'

export default function CancelButton({ token }: { token: string }) {
  const [open,      setOpen]      = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const cancel = async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/cancel/${token}`, { method: 'POST' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setCancelled(true)
      setOpen(false)
      toast.success('Cita cancelada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
    } finally {
      setLoading(false)
    }
  }

  if (cancelled) {
    return (
      <p className="text-center text-sm leading-relaxed text-ink-muted">
        Tu cita fue cancelada. Puedes agendar de nuevo cuando gustes.
      </p>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-center rounded-lg text-xs font-medium text-ink-subtle transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        Cancelar esta cita
      </button>

      <AlertDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={cancel}
        title="¿Cancelar tu cita?"
        description="Se liberará tu lugar y no podremos deshacer el cambio. Si prefieres otra fecha, puedes reagendarla."
        confirmLabel="Sí, cancelar"
        cancelLabel="No, conservarla"
        variant="danger"
        loading={loading}
      />
    </>
  )
}
