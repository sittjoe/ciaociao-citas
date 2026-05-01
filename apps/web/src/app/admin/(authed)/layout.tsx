import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/admin-session'
import { AdminShell } from './AdminShell'

export const dynamic = 'force-dynamic'

export default async function AuthedAdminLayout({ children }: { children: React.ReactNode }) {
  const session = (await cookies()).get('__session')?.value

  if (!verifySession(session)) {
    redirect('/admin/login')
  }

  return <AdminShell>{children}</AdminShell>
}
