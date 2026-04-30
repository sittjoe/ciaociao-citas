'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Settings, LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const navItems = [
  { href: '/admin',        label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/admin/citas',  label: 'Citas',      Icon: CalendarDays    },
  { href: '/admin/slots',  label: 'Slots',      Icon: Settings        },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const router    = useRouter()
  const [open, setOpen] = useState(false)

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' })
    toast.success('Sesión cerrada')
    router.push('/admin/login')
    router.refresh()
  }

  const NavContent = () => (
    <>
      <div className="px-6 py-6 border-b border-rich-muted">
        <p className="font-serif text-lg text-gold-400 tracking-widest uppercase">Ciao Ciao</p>
        <p className="text-xs text-gold-800 tracking-widest mt-0.5">Admin</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                active
                  ? 'bg-gold-500/15 text-gold-300 font-medium'
                  : 'text-gold-700 hover:text-gold-400 hover:bg-white/5',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-rich-muted">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gold-800 hover:text-red-400 hover:bg-red-900/10 transition-all w-full"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-rich-soft border-r border-rich-muted fixed inset-y-0 left-0">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-rich-soft border-b border-rich-muted">
        <p className="font-serif text-gold-400 tracking-widest uppercase">Ciao Ciao</p>
        <button
          onClick={() => setOpen(!open)}
          className="text-gold-600 hover:text-gold-400 transition-colors p-1"
          aria-label="Menú"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-rich-soft border-r border-rich-muted lg:hidden">
            <NavContent />
          </aside>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-56 pt-16 lg:pt-0">
        <div className="p-5 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
