import { cn } from '@/lib/utils'
import { Button } from './Button'

type ActionProp =
  | { label: string; onClick: () => void }
  | React.ReactNode

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: ActionProp
  className?: string
}

function isActionObject(a: ActionProp): a is { label: string; onClick: () => void } {
  return typeof a === 'object' && a !== null && !('$$typeof' in (a as object)) && 'label' in (a as object)
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 px-6 text-center', className)}>
      {icon && (
        <div className="mb-4 text-ink-subtle opacity-60">
          {icon}
        </div>
      )}
      <p className="font-serif text-display-sm font-light text-ink mb-2">{title}</p>
      {description && (
        <p className="text-sm text-ink-muted max-w-xs leading-relaxed mb-6">{description}</p>
      )}
      {action && (
        isActionObject(action)
          ? <Button variant="outline" size="sm" onClick={action.onClick}>{action.label}</Button>
          : <>{action}</>
      )}
    </div>
  )
}
