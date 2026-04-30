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
    <div className={cn('space-y-1', className)}>
      <label className="label-luxury">
        {label}
        {required && <span className="text-gold-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  )
}
