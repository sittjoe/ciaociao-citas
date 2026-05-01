'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Settings, LogOut, Menu, X, Users, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const navItems = [
  { href: '/admin',        label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/admin/citas',  label: 'Citas',      Icon: CalendarDays    },
  { href: '/admin/slots',  label: 'Slots',      Icon: Settings        },
  { href: '/admin/admins', label: 'Admins',     Icon: Users           },
  { href: '/admin/cuenta', label: 'Mi cuenta',  Icon: KeyRound        },
]

export function AdminShell({ children, adminEmail }: { children: React.ReactNode; adminEmail: string }) {
  const pathname  = usePathname()
  const router    = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' })
    toast.success('Sesión cerrada')
    router.push('/admin/login')
    router.refresh()
  }

  const NavContent = () => (
    <>
      <div className="px-6 py-6 border-b border-stone-100">
        <p className="font-serif text-lg text-ink tracking-widest uppercase">Ciao Ciao</p>
        <p className="text-xs text-ink-subtle tracking-widest mt-0.5">Admin</p>
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
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-deep focus-visible:ring-offset-2',
                active
                  ? 'bg-champagne-soft text-champagne font-medium'
                  : 'text-ink-muted hover:text-ink hover:bg-cream-soft',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-stone-100">
        <p className="px-3 pb-2 text-[0.68rem] text-ink-subtle truncate">{adminEmail}</p>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-muted hover:text-red-500 hover:bg-red-50 transition-all w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex bg-cream text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-[60] bg-white px-3 py-2 rounded-lg text-sm font-medium text-champagne-deep border border-champagne-soft shadow-lift"
      >
        Saltar al contenido
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-stone-100 fixed inset-y-0 left-0">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-white border-b border-stone-100">
        <p className="font-serif text-ink tracking-widest uppercase">Ciao Ciao</p>
        <button
          onClick={() => setOpen(!open)}
          className="text-ink-muted hover:text-ink transition-colors p-1"
          aria-label="Menú"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-stone-100 lg:hidden"
          >
            <NavContent />
          </aside>
        </>
      )}

      {/* Main content */}
      <main id="main-content" className="flex-1 lg:ml-56 pt-16 lg:pt-0">
        <div className="p-5 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
