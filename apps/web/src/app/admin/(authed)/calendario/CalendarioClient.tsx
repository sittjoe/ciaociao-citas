'use client'

import dynamic from 'next/dynamic'

const AdminCalendar = dynamic(
  () => import('@/components/admin/AdminCalendar').then(m => ({ default: m.AdminCalendar })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] animate-pulse rounded-2xl bg-admin-surface border border-admin-line" />
    ),
  }
)

export function CalendarioClient() {
  return <AdminCalendar />
}
