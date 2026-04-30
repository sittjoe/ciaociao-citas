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

  const handleFile = useCallback((file: File | null) => {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) return
    if (file.size > 5 * 1024 * 1024) return
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
        <div className="flex items-center justify-between p-3 bg-rich-muted border border-gold-700/40 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck size={18} className="text-gold-500 shrink-0" />
            <span className="text-sm text-gold-light truncate">{value.name}</span>
            <span className="text-xs text-gold-700 shrink-0">({(value.size / 1024).toFixed(0)} KB)</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-2 text-gold-700 hover:text-red-400 transition-colors shrink-0"
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
              ? 'border-gold-500 bg-gold-500/10'
              : 'border-rich-subtle hover:border-gold-700 hover:bg-white/3',
            error && 'border-red-700/60',
          )}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={onInputChange}
            className="sr-only"
          />
          <Upload size={24} className={cn('transition-colors', dragging ? 'text-gold-400' : 'text-gold-700')} />
          <div className="text-center">
            <p className="text-sm text-gold-light">
              <span className="text-gold-400 font-medium">Selecciona</span> o arrastra tu identificación
            </p>
            <p className="text-xs text-gold-700 mt-0.5">JPG, PNG, WebP o PDF · máx. 5 MB</p>
          </div>
        </label>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
