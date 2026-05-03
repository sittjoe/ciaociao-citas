'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Settings, LogOut, Menu, X, Users, KeyRound } from 'lucide-react'
import { motion, AnimatePresence, LayoutGroup } from '@/components/motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const navItems = [
  { href: '/admin',        label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/admin/citas',  label: 'Citas',      Icon: CalendarDays    },
  { href: '/admin/slots',  label: 'Slots',      Icon: Settings        },
  { href: '/admin/admins', label: 'Admins',     Icon: Users           },
  { href: '/admin/cuenta', label: 'Mi cuenta',  Icon: KeyRound        },
]

function Logomark() {
  return (
    <div className="border-b border-admin-line px-4 py-4">
      <p className="font-serif text-lg font-light tracking-[0.22em] uppercase text-ink leading-none">
        Ciao Ciao
      </p>
      <p className="text-[0.625rem] tracking-[0.28em] uppercase text-ink-subtle mt-1 font-medium">
        Joyería · Admin
      </p>
    </div>
  )
}

function NavList({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  return (
    <LayoutGroup>
      <nav className="flex-1 p-2.5 space-y-0.5">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
                active ? 'text-champagne-deep font-medium' : 'text-ink-muted hover:text-ink hover:bg-admin-surface',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-lg bg-champagne-tint"
                  transition={{ ease: [0.25, 1, 0.5, 1], duration: 0.3 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={16} strokeWidth={active ? 1.75 : 1.5} />
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </LayoutGroup>
  )
}

export function AdminShell({ children, adminEmail }: { children: React.ReactNode; adminEmail: string }) {
  const pathname = usePathname()
  const router   = useRouter()
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

  const initials = adminEmail
    .split('@')[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="min-h-screen flex bg-admin-surface text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-[60] bg-white px-3 py-2 rounded-lg text-sm font-medium text-champagne-deep border border-champagne-soft shadow-lift"
      >
        Saltar al contenido
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-admin-panel border-r border-admin-line fixed inset-y-0 left-0">
        <Logomark />
        <NavList pathname={pathname} onClose={() => {}} />
        <div className="p-3 border-t border-admin-line">
          <div className="flex items-center gap-2.5 px-3 pb-2.5">
            <span className="w-7 h-7 rounded-full bg-champagne-soft border border-champagne-soft/60 flex items-center justify-center text-[0.65rem] font-semibold text-champagne-deep shrink-0">
              {initials}
            </span>
            <span className="text-[0.68rem] text-ink-subtle truncate">{adminEmail}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-muted hover:text-red-500 hover:bg-red-50 transition-all w-full focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <LogOut size={15} strokeWidth={1.5} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-admin-panel border-b border-admin-line">
        <p className="font-serif tracking-[0.2em] uppercase text-ink">Ciao Ciao</p>
        <button
          onClick={() => setOpen(!open)}
          className="text-ink-muted hover:text-ink transition-colors p-1 rounded-lg focus-visible:shadow-focus-ring"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
        >
          {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
        </button>
      </header>

      {/* Mobile drawer with AnimatePresence */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Menú de navegación"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ ease: [0.25, 1, 0.5, 1], duration: 0.32 }}
              className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-admin-panel border-r border-admin-line lg:hidden"
            >
              <Logomark />
              <NavList pathname={pathname} onClose={() => setOpen(false)} />
              <div className="p-3 border-t border-admin-line">
                <div className="flex items-center gap-2.5 px-3 pb-2.5">
                  <span className="w-7 h-7 rounded-full bg-champagne-soft flex items-center justify-center text-[0.65rem] font-semibold text-champagne-deep shrink-0">
                    {initials}
                  </span>
                  <span className="text-[0.68rem] text-ink-subtle truncate">{adminEmail}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-muted hover:text-red-500 hover:bg-red-50 transition-all w-full"
                >
                  <LogOut size={15} strokeWidth={1.5} /> Cerrar sesión
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main id="main-content" className="flex-1 lg:ml-56 pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
