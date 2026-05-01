'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface AlertDialogProps {
  open: boolean
  onClose?: () => void
  onCancel?: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  loading?: boolean
}

export function AlertDialog({
  open,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading,
}: AlertDialogProps) {
  const dismiss = onCancel ?? onClose ?? (() => {})
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    setTimeout(() => cancelRef.current?.focus(), 50)
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="alert-title"
          aria-describedby={description ? 'alert-desc' : undefined}
        >
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
          />
          <motion.div
            className={cn(
              'relative w-full max-w-sm bg-white rounded-2xl shadow-lift',
              'border border-ink-line p-6',
            )}
            initial={{ opacity: 0, scale: 0.97, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.28 }}
          >
            <h2
              id="alert-title"
              className="font-serif text-display-sm font-light text-ink mb-2"
            >
              {title}
            </h2>
            {description && (
              <p id="alert-desc" className="text-sm text-ink-muted leading-relaxed mb-6">
                {description}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <Button
                ref={cancelRef}
                variant="ghost"
                size="sm"
                onClick={dismiss}
                disabled={loading}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'danger' ? 'danger' : 'outline'}
                size="sm"
                onClick={onConfirm}
                loading={loading}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
