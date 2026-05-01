'use client'

import { useCallback, useState } from 'react'
import { Upload, FileCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IDUploaderProps {
  value?:    File | null
  onChange:  (file: File | null) => void
  error?:    string
}

export function IDUploader({ value, onChange, error }: IDUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)

  const handleFile = useCallback((file: File | null) => {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setInternalError('Formato no permitido. Usa JPG, PNG, WebP o PDF.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setInternalError('El archivo supera 5 MB.')
      return
    }
    setInternalError(null)
    onChange(file)
  }, [onChange])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0] ?? null)
  }, [handleFile])

  return (
    <div className="space-y-1">
      {value ? (
        <div className="flex items-center justify-between p-3 bg-cream-soft border border-stone-100 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck size={18} className="text-champagne shrink-0" />
            <span className="text-sm text-ink truncate">{value.name}</span>
            <span className="text-xs text-ink-muted shrink-0">({(value.size / 1024).toFixed(0)} KB)</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-2 text-ink-muted hover:text-red-500 transition-colors shrink-0"
            aria-label="Quitar archivo"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed',
            'cursor-pointer transition-all duration-200',
            dragging
              ? 'border-champagne bg-champagne-soft scale-[1.01]'
              : 'border-stone-200 hover:border-champagne hover:bg-champagne-soft/50',
            error && 'border-red-300',
          )}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={onInputChange}
            className="sr-only"
          />
          <Upload size={24} className={cn(
            'transition-colors duration-150',
            dragging ? 'text-champagne' : 'text-ink-subtle',
          )} />
          <div className="text-center">
            <p className="text-sm text-ink">
              <span className="text-champagne font-medium">Selecciona</span> o arrastra tu identificación
            </p>
            <p className="text-xs text-ink-muted mt-0.5">JPG, PNG, WebP o PDF · máx. 5 MB</p>
          </div>
        </label>
      )}
      {(internalError ?? error) && <p className="text-xs text-red-500">{internalError ?? error}</p>}
    </div>
  )
}
