import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

// Esqueleto de la hoja del día: refleja el encabezado y dos tarjetas de cita
// mientras el servidor trae las citas de hoy.
export default function HoyLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-lg" />
      </div>

      <section className="space-y-3">
        <Skeleton className="h-3 w-24 rounded-full" />
        {[0, 1].map(i => (
          <Card key={i} variant="admin" className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-6 w-20 rounded-lg" />
                <Skeleton className="h-4 w-32 rounded-lg" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 flex-1 rounded-xl" />
            </div>
          </Card>
        ))}
      </section>
    </div>
  )
}
