'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

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
    return <p className="text-sm text-stone-400 text-center">Cita cancelada.</p>
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-xs text-red-400/60 hover:text-red-400 transition-colors py-1"
      >
        Cancelar esta cita
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="¿Cancelar cita?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gold-700">
            ¿Estás seguro de que deseas cancelar? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              No, mantener
            </Button>
            <Button variant="danger" className="flex-1" loading={loading} onClick={cancel}>
              Sí, cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
