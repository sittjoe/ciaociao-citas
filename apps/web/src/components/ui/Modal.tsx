'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from '@/components/motion'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface ModalProps {
  open:     boolean
  onClose:  () => void
  title?:   string
  children: React.ReactNode
  size?:    'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last  = focusable[focusable.length - 1]
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
          e.preventDefault()
          const target = e.shiftKey ? last : first
          // Body scrolls now, so bring the wrapped target into view before focus
          target?.scrollIntoView({ block: 'nearest' })
          target?.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    // Fall back to the panel itself so focus never lands on document.body
    // for content-only modals (keeps the focus trap and Escape working).
    ;(firstFocusable ?? panelRef.current)?.focus()
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/25 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-label={title ? undefined : 'Diálogo'}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
            className={cn(
              // Cap height to the viewport and lay out as a column so a long
              // body scrolls internally instead of pushing the action buttons
              // (Confirmar/Rechazar) off the bottom of the screen.
              'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden',
              'bg-admin-panel border border-admin-line rounded-2xl shadow-lift',
              sizeMap[size],
            )}
          >
            {title ? (
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-admin-line px-6 py-4">
                <h2 id="modal-title" className="font-serif text-xl text-ink">{title}</h2>
                <button
                  onClick={onClose}
                  className="-mr-1.5 shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-cream-soft hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-cream-soft hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            )}
            <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-6', title ? 'py-5' : 'pt-12 pb-6')}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
