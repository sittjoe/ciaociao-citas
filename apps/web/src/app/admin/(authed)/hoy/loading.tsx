import { Skeleton } from '@/components/ui/Skeleton'

// Esqueleto de la Agenda: encabezado, tira de la semana y dos citas en la
// línea de tiempo, con la bandeja al lado (arriba en móvil).
export default function AgendaLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-4 w-56 rounded-lg" />
      </div>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="space-y-5">
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-16 flex-1 rounded-xl" />)}
          </div>
          <Skeleton className="h-7 w-24 rounded-lg" />
          {[0, 1].map(i => (
            <div key={i} className="grid grid-cols-[4.5rem_1fr] gap-3">
              <Skeleton className="ml-auto mt-3 h-6 w-14 rounded-lg" />
              <Skeleton className="h-[124px] rounded-2xl" />
            </div>
          ))}
        </div>
        <div className="order-first space-y-3 xl:order-none">
          <Skeleton className="h-7 w-36 rounded-lg" />
          <Skeleton className="h-[132px] rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
