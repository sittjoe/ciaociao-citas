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
    return <p className="text-sm text-ink-subtle text-center">Cita cancelada.</p>
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-xs text-red-400/60 hover:text-red-500 transition-colors py-1"
      >
        Cancelar esta cita
      </button>

      <AlertDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={cancel}
        title="¿Cancelar cita?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        cancelLabel="No, mantener"
        variant="danger"
        loading={loading}
      />
    </>
  )
}
