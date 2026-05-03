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
          ;(e.shiftKey ? last : first)?.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
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
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
            className={cn(
              'relative w-full bg-admin-panel border border-admin-line rounded-2xl shadow-lift p-6',
              sizeMap[size],
            )}
          >
            {title && (
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-xl text-ink">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-ink-muted hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-cream-soft"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {!title && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-cream-soft"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
