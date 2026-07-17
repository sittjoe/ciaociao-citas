import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Skeleton de transición para TODAS las rutas del admin (segmento authed).
 * Genérico a propósito: encabezado + bloques de contenido, sin asumir la
 * anatomía de cada pantalla. La vista Hoy tiene el suyo propio (hoy/loading.tsx),
 * que Next prefiere por ser más específico.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="hidden h-28 rounded-2xl lg:block" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}
