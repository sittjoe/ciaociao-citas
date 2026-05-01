import { cn } from '@/lib/utils'

interface FieldProps {
  label:    string
  error?:   string
  required?: boolean
  children: React.ReactNode
  className?: string
}

export function Field({ label, error, required, children, className }: FieldProps) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="label-clean">
        {label}
        {required && <span className="text-champagne ml-1" aria-hidden="true">*</span>}
      </span>
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1" role="alert">{error}</p>
      )}
    </label>
  )
}
