'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'gold' | 'outline' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?:    Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  gold: [
    'bg-champagne text-white font-semibold',
    'hover:bg-champagne-deep hover:-translate-y-px hover:shadow-pop',
    'active:scale-[0.98]',
    'disabled:opacity-40',
  ].join(' '),
  outline: [
    'border border-champagne text-champagne',
    'hover:bg-champagne-soft',
    'active:scale-[0.98]',
    'disabled:opacity-40',
  ].join(' '),
  ghost: [
    'text-ink-muted',
    'hover:text-ink hover:bg-cream-soft',
    'active:scale-[0.98]',
    'disabled:opacity-40',
  ].join(' '),
  danger: [
    'bg-red-50 text-red-600 border border-red-200',
    'hover:bg-red-100',
    'active:scale-[0.98]',
    'disabled:opacity-40',
  ].join(' '),
}

const sizeClasses: Record<Size, string> = {
  sm: 'py-1.5 px-3 text-xs rounded-lg',
  md: 'py-2.5 px-5 text-sm rounded-xl',
  lg: 'py-3 px-7 text-base rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'gold', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-all duration-200 cursor-pointer',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
