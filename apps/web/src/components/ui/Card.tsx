'use client'

import { cn } from '@/lib/utils'

type CardVariant = 'flat' | 'whisper' | 'soft' | 'lift'

interface CardProps {
  children: React.ReactNode
  variant?: CardVariant
  className?: string
  as?: React.ElementType
  onClick?: () => void
}

const variantMap: Record<CardVariant, string> = {
  flat:    'bg-white border border-ink-line',
  whisper: 'bg-white shadow-whisper',
  soft:    'bg-white border border-ink-line shadow-soft',
  lift:    'bg-white border border-ink-line shadow-lift',
}

export function Card({ children, variant = 'soft', className, as: Tag = 'div', onClick }: CardProps) {
  return (
    <Tag
      onClick={onClick}
      className={cn('rounded-2xl', variantMap[variant], className)}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 pt-6 pb-4', className)}>{children}</div>
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 pb-6', className)}>{children}</div>
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-6 py-4 border-t border-ink-line', className)}>
      {children}
    </div>
  )
}
