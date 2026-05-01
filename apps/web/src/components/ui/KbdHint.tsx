import { cn } from '@/lib/utils'

interface KbdHintProps {
  keys: string[]
  className?: string
}

export function KbdHint({ keys, className }: KbdHintProps) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((key, i) => (
        <kbd
          key={i}
          className={cn(
            'inline-flex items-center justify-center',
            'min-w-[1.375rem] h-[1.375rem] px-1.5',
            'text-11 font-sans font-medium text-ink-muted',
            'bg-cream-soft border border-ink-line rounded-md',
            'shadow-[0_1px_0_0_#E8E2D4]',
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}
