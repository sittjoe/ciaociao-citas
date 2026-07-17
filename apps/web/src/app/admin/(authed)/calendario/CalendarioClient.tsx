'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

const AdminCalendar = dynamic(
  () => import('@/components/admin/AdminCalendar').then(m => ({ default: m.AdminCalendar })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[600px] w-full border border-admin-line" />
      </div>
    ),
  }
)

export function CalendarioClient() {
  return <AdminCalendar />
}
