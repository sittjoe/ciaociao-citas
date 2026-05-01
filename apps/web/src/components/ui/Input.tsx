'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// ── Input ──────────────────────────────────────────────────────────────────

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  error?: boolean
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, prefix, suffix, className, ...props }, ref) => {
    if (prefix || suffix) {
      return (
        <div
          className={cn(
            'flex items-center gap-2 w-full bg-white rounded-xl px-4',
            'border transition-all duration-200',
            error
              ? 'border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
              : 'border-ink-line focus-within:border-champagne focus-within:shadow-focus-ring',
          )}
        >
          {prefix && <span className="text-ink-subtle shrink-0">{prefix}</span>}
          <input
            ref={ref}
            className={cn(
              'flex-1 min-w-0 bg-transparent py-3 text-ink placeholder:text-ink-subtle outline-none',
              className,
            )}
            {...props}
          />
          {suffix && <span className="text-ink-subtle shrink-0">{suffix}</span>}
        </div>
      )
    }

    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-white rounded-xl px-4 py-3',
          'border transition-all duration-200 outline-none',
          'text-ink placeholder:text-ink-subtle',
          error
            ? 'border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
            : 'border-ink-line focus:border-champagne focus:shadow-focus-ring',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

// ── Textarea ───────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full bg-white rounded-xl px-4 py-3 resize-none',
        'border transition-all duration-200 outline-none',
        'text-ink placeholder:text-ink-subtle',
        error
          ? 'border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
          : 'border-ink-line focus:border-champagne focus:shadow-focus-ring',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

// ── Select ─────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full bg-white rounded-xl px-4 py-3',
        'border transition-all duration-200 outline-none cursor-pointer',
        'text-ink appearance-none',
        error
          ? 'border-red-400 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
          : 'border-ink-line focus:border-champagne focus:shadow-focus-ring',
        className,
      )}
      {...props}
    />
  ),
)
Select.displayName = 'Select'
