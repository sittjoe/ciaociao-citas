'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, FileCheck, Images, Loader2, RefreshCw, Upload } from 'lucide-react'
import { motion, AnimatePresence } from '@/components/motion'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface IDUploaderProps {
  value?:   File | null
  onChange: (file: File | null) => void
  error?:   string
}

// El body de Vercel admite 4.5 MB; dejamos margen para el resto del formulario.
const TARGET_BYTES   = Math.floor(3.5 * 1024 * 1024)
const MAX_LONG_SIDE  = 1600
const JPEG_QUALITIES = [0.8, 0.65, 0.5, 0.35]

const MSG_DECODE  = 'No pudimos leer esa imagen. Intenta tomar la foto de nuevo.'
const MSG_TOO_BIG = 'No pudimos reducir la imagen lo suficiente. Intenta con otra foto.'
const MSG_PDF_BIG = 'Tu PDF pesa demasiado. Mejor toma una foto de tu identificación.'
const MSG_FORMAT  = 'Formato no permitido. Usa una foto (JPG, PNG, WebP) o un PDF.'

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img   = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src     = url
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('encode'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Comprime en el cliente: redimensiona a máx. 1600 px de lado largo y codifica
 * a JPEG bajando la calidad escalonadamente hasta caber en TARGET_BYTES.
 * (Una foto de iPhone sin comprimir rompe el límite de body de Vercel.)
 */
async function compressImage(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const w   = img.naturalWidth
    const h   = img.naturalHeight
    if (!w || !h) throw new Error('decode')

    const scale  = Math.min(1, MAX_LONG_SIDE / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width  = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('encode')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    let blob: Blob | null = null
    for (const quality of JPEG_QUALITIES) {
      blob = await canvasToJpeg(canvas, quality)
      if (blob.size <= TARGET_BYTES) break
    }
    if (!blob || blob.size > TARGET_BYTES) throw new Error('too-big')

    // Si el original ya era un JPEG pequeño y sin redimensionar, consérvalo.
    if (file.type === 'image/jpeg' && scale === 1 && file.size <= Math.min(TARGET_BYTES, blob.size)) {
      return file
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'identificacion'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

type Phase = 'picker' | 'processing' | 'error'

export function IDUploader({ value, onChange, error }: IDUploaderProps) {
  const [phase,        setPhase]        = useState<Phase>('picker')
  const [processError, setProcessError] = useState<string | null>(null)
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null)
  const [dragging,     setDragging]     = useState(false)

  const cameraInputRef  = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const rawFileRef      = useRef<File | null>(null)

  // Miniatura derivada del value (sobrevive a montajes/desmontajes del paso).
  useEffect(() => {
    if (value && value.type.startsWith('image/')) {
      const url = URL.createObjectURL(value)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
  }, [value])

  const handleFile = useCallback(async (file: File | null) => {
    if (!file || file.size === 0) return
    rawFileRef.current = file
    setProcessError(null)

    if (file.type === 'application/pdf') {
      if (file.size > TARGET_BYTES) {
        setProcessError(MSG_PDF_BIG)
        setPhase('error')
        return
      }
      setPhase('picker')
      onChange(file)
      return
    }

    if (!file.type.startsWith('image/')) {
      setProcessError(MSG_FORMAT)
      setPhase('error')
      return
    }

    setPhase('processing')
    try {
      const compressed = await compressImage(file)
      setPhase('picker')
      onChange(compressed)
    } catch (err) {
      setProcessError(err instanceof Error && err.message === 'decode' ? MSG_DECODE : MSG_TOO_BIG)
      setPhase('error')
    }
  }, [onChange])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // permite volver a elegir el mismo archivo
    void handleFile(file)
  }, [handleFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const reset = useCallback(() => {
    rawFileRef.current = null
    setProcessError(null)
    setPhase('picker')
    onChange(null)
  }, [onChange])

  const retry = useCallback(() => {
    if (rawFileRef.current) void handleFile(rawFileRef.current)
    else reset()
  }, [handleFile, reset])

  const displayError = phase !== 'error' ? error : null
  const view: 'ready' | Phase = value ? 'ready' : phase

  return (
    <div className="space-y-1">
      {/* Inputs ocultos: viven fuera de AnimatePresence para conservar los refs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <AnimatePresence mode="wait">
        {view === 'ready' && value ? (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-1.5"
          >
            <div className="flex items-center gap-3 p-3 bg-cream-soft border border-ink-line rounded-xl">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Vista previa de tu identificación"
                  className="w-16 h-16 object-cover rounded-lg border border-ink-line shrink-0"
                />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center bg-white border border-ink-line rounded-lg shrink-0">
                  <FileCheck size={22} strokeWidth={1.5} className="text-champagne" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink truncate">{value.name}</p>
                <p className="text-xs text-ink-muted mt-0.5">Lista para enviar · {formatSize(value.size)}</p>
              </div>
              <Button
                variant="outline"
                onClick={reset}
                className="shrink-0 min-h-[44px]"
              >
                Cambiar
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              ¿Tu identificación se ve borrosa? Puedes volver a tomarla.
            </p>
          </motion.div>
        ) : view === 'processing' ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-ink-line"
          >
            <Loader2 size={24} strokeWidth={1.5} className="animate-spin text-champagne" />
            <div className="text-center">
              <p className="text-sm text-ink">Preparando tu fotografía…</p>
              <p className="text-xs text-ink-muted mt-0.5">La optimizamos para que suba rápido</p>
            </div>
          </motion.div>
        ) : view === 'error' ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="p-4 rounded-xl border border-red-200 bg-red-50 space-y-3"
          >
            <p className="text-sm text-red-600" role="alert">{processError}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={retry} className="w-full min-h-[48px]">
                <RefreshCw size={16} strokeWidth={1.5} />
                Reintentar
              </Button>
              <button
                type="button"
                onClick={reset}
                className={cn(
                  'flex items-center justify-center gap-2 min-h-[48px] px-3 rounded-xl',
                  'border border-ink-line text-ink text-sm font-medium',
                  'hover:bg-cream-soft active:scale-[0.98] transition-all duration-200',
                )}
              >
                Elegir otro archivo
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'p-4 rounded-xl border-2 border-dashed space-y-3 transition-all duration-200',
              dragging
                ? 'border-champagne bg-champagne-soft scale-[1.01]'
                : 'border-ink-line',
              error && !dragging && 'border-red-300',
            )}
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 min-h-[72px] px-3 py-3 rounded-xl',
                  'bg-champagne-solid text-white text-sm font-semibold',
                  'hover:bg-champagne-deep hover:-translate-y-px hover:shadow-pop',
                  'active:scale-[0.98] transition-all duration-200',
                )}
              >
                <Camera size={22} strokeWidth={1.5} />
                Tomar foto
              </button>
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 min-h-[72px] px-3 py-3 rounded-xl',
                  'border border-champagne text-champagne-solid text-sm font-medium text-center',
                  'hover:bg-champagne-soft active:scale-[0.98] transition-all duration-200',
                )}
              >
                <Images size={22} strokeWidth={1.5} />
                Elegir de mis fotos
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <Upload size={14} strokeWidth={1.5} className="text-ink-subtle shrink-0" />
              <p className="text-xs text-ink-muted text-center">
                JPG, PNG, WebP o PDF · la foto se optimiza automáticamente
              </p>
            </div>
            <p className="text-center text-[11px] leading-4 text-ink-subtle">
              Solo la usamos para verificar tu visita. Tus datos viajan cifrados.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {displayError && (
        <p className="text-xs text-red-500">{displayError}</p>
      )}
    </div>
  )
}
