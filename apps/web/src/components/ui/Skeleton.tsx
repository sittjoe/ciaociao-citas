import { cn } from '@/lib/utils'

type SkeletonVariant = 'text' | 'block' | 'circle' | 'table-row'

interface SkeletonProps {
  variant?: SkeletonVariant
  className?: string
  rows?: number
  rounded?: boolean
}

export function Skeleton({ variant = 'block', className, rows = 1, rounded }: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 rounded-lg shimmer',
              i === rows - 1 && rows > 1 ? 'w-3/5' : 'w-full',
            )}
          />
        ))}
      </div>
    )
  }

  if (variant === 'circle') {
    return <div className={cn('rounded-full shimmer', className)} />
  }

  if (variant === 'table-row') {
    return (
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div className="h-4 w-28 rounded-lg shimmer" />
        <div className="h-4 flex-1 rounded-lg shimmer" />
        <div className="h-4 w-20 rounded-lg shimmer" />
        <div className="h-4 w-16 rounded-lg shimmer" />
        <div className="h-6 w-20 rounded-full shimmer" />
      </div>
    )
  }

  return <div className={cn(rounded ? 'rounded-full' : 'rounded-2xl', 'shimmer', className)} />
}

// Convenience: 8 table-row skeletons for table loading state
export function TableSkeleton({ rows = 8, cols: _cols }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-ink-line/50">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="table-row" />
      ))}
    </div>
  )
}
