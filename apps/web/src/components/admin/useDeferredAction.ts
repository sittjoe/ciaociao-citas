'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

/*
 * «Deshacer» seguro: la acción NO se envía al servidor hasta que pasa la
 * ventana de gracia. Mientras tanto la UI ya muestra el resultado (optimista)
 * y el toast ofrece deshacer. Así deshacer nunca tiene que revertir correos ya
 * enviados: simplemente no se manda nada.
 *
 * Si la persona cierra o cambia de página antes de que venza la ventana, lo
 * pendiente se envía en ese momento (pagehide / desmontaje), con keepalive
 * en el fetch del llamador para que el navegador no lo corte.
 */

interface Pending {
  timer: number
  toastId: string | number
  run: () => Promise<void>
}

export interface DeferredOptions {
  /** Texto del toast («Aceptando la cita de Mariana…»). */
  message: string
  /** Lo que se envía al vencer la ventana. */
  run: () => Promise<void>
  /** Restaura la UI si la persona pulsa «Deshacer». */
  onUndo: () => void
  delayMs?: number
}

export const UNDO_WINDOW_MS = 6000

export function useDeferredAction() {
  const pending = useRef(new Map<string, Pending>())

  useEffect(() => {
    const map = pending.current
    const flush = () => {
      for (const [key, item] of map) {
        window.clearTimeout(item.timer)
        map.delete(key)
        // Ya se envía: el toast no puede seguir ofreciendo «Deshacer».
        toast.dismiss(item.toastId)
        void item.run()
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  return useCallback((key: string, { message, run, onUndo, delayMs = UNDO_WINDOW_MS }: DeferredOptions) => {
    const map = pending.current
    const previous = map.get(key)
    if (previous) {
      window.clearTimeout(previous.timer)
      toast.dismiss(previous.toastId)
    }

    const toastId = toast(message, {
      duration: delayMs,
      action: {
        label: 'Deshacer',
        onClick: () => {
          const item = map.get(key)
          // La ventana ya venció (sonner pausa el toast con el puntero encima)
          // o se envió al cambiar de página: decirlo, no fingir que se deshizo.
          if (!item || item.toastId !== toastId) {
            toast.error('Ya se había guardado; no se pudo deshacer.')
            return
          }
          window.clearTimeout(item.timer)
          map.delete(key)
          onUndo()
          toast.dismiss(toastId)
        },
      },
    })

    const timer = window.setTimeout(() => {
      map.delete(key)
      toast.dismiss(toastId)
      void run()
    }, delayMs)
    map.set(key, { timer, toastId, run })
  }, [])
}
