'use client'

import { useEffect } from 'react'
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
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full bg-rich-soft border border-rich-muted rounded-2xl shadow-gold',
          'p-6 fade-up',
          sizeMap[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif text-xl text-gold-400">{title}</h2>
            <button
              onClick={onClose}
              className="text-gold-700 hover:text-gold-400 transition-colors p-1 rounded-lg hover:bg-white/5"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gold-700 hover:text-gold-400 transition-colors p-1 rounded-lg hover:bg-white/5"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
