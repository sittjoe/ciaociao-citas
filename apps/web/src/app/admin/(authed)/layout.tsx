import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin-auth'
import { AdminShell } from './AdminShell'

export const dynamic = 'force-dynamic'

export default async function AuthedAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession()
  if (!session) {
    redirect('/admin/login')
  }

  return <AdminShell adminEmail={session.email}>{children}</AdminShell>
}
