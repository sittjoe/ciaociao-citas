'use client'

import { useId } from 'react'
import { AnimatePresence, motion } from '@/components/motion'
import { cn } from '@/lib/utils'

interface FieldProps {
  label:     string
  error?:    string
  hint?:     string
  required?: boolean
  children:  React.ReactNode | ((id: string, ariaProps: Record<string, string | boolean | undefined>) => React.ReactNode)
  className?: string
}

export function Field({ label, error, hint, required, children, className }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId  = `${id}-hint`

  const ariaProps = {
    'aria-describedby': [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : undefined,
  }
  const content = typeof children === 'function' ? children(id, ariaProps) : children

  return (
    <div className={cn('block space-y-1.5', className)}>
      <label htmlFor={id} className="label-clean">
        {label}
        {required && <span className="text-champagne ml-1" aria-hidden="true">*</span>}
      </label>

      {content}

      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">{hint}</p>
      )}

      <AnimatePresence>
        {error && (
          <motion.p
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-red-500"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
