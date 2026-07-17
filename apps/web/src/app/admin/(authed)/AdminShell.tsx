'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, CalendarRange, CalendarClock, Settings, LogOut, Menu, X, Users, KeyRound, AlertTriangle, CalendarOff } from 'lucide-react'
import { motion, AnimatePresence, LayoutGroup } from '@/components/motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const navItems = [
  { href: '/admin/hoy',         label: 'Hoy',        Icon: CalendarClock   },
  { href: '/admin',             label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/admin/problemas',   label: 'Problemas',  Icon: AlertTriangle   },
  { href: '/admin/citas',       label: 'Citas',      Icon: CalendarDays    },
  { href: '/admin/calendario',  label: 'Calendario', Icon: CalendarRange   },
  { href: '/admin/slots',       label: 'Slots',      Icon: Settings        },
  { href: '/admin/bloqueos',    label: 'Bloqueos',   Icon: CalendarOff     },
  { href: '/admin/admins',      label: 'Admins',     Icon: Users           },
  { href: '/admin/cuenta',      label: 'Mi cuenta',  Icon: KeyRound        },
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

interface NavCounts {
  pendientes: number
  problemas: number
}

/** Badge numérico del nav para el href dado (undefined = sin badge). */
function navBadgeCount(href: string, counts: NavCounts | null): number | undefined {
  if (!counts) return undefined
  if (href === '/admin/citas')     return counts.pendientes
  if (href === '/admin/problemas') return counts.problemas
  return undefined
}

function NavBadge({ href, count, active }: { href: string; count: number; active: boolean }) {
  const isProblem = href === '/admin/problemas'
  return (
    <span
      className={cn(
        'relative z-10 ml-auto inline-flex min-w-[1.375rem] items-center justify-center rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none tabular-nums',
        isProblem
          ? 'bg-red-50 text-red-600 border-red-200'
          // En el ítem activo el fondo del pill ya es champagne-tint; sube el
          // tono del badge para que no se funda con él.
          : active
            ? 'bg-champagne-soft text-champagne-deep border-champagne'
            : 'bg-champagne-tint text-champagne-deep border-champagne-soft',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavList({ pathname, onClose, counts }: { pathname: string; onClose: () => void; counts: NavCounts | null }) {
  return (
    <LayoutGroup>
      <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href
          const badge  = navBadgeCount(href, counts)
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[2.75rem] items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
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
              {typeof badge === 'number' && badge > 0 && <NavBadge href={href} count={badge} active={active} />}
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
  const [counts, setCounts] = useState<NavCounts | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Evita el scroll del fondo mientras el cajón móvil está abierto.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  // Badges del nav: al montar, al navegar y al volver a la app (visibilitychange
  // — el admin usa el panel desde iPhone y lo deja en segundo plano). Silencioso
  // a propósito: si falla, simplemente no se pintan badges.
  useEffect(() => {
    let cancelled = false
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/admin/nav-counts')
        if (!res.ok) return
        const data = await res.json() as Partial<NavCounts>
        if (!cancelled) {
          setCounts({
            pendientes: Number(data.pendientes ?? 0),
            problemas:  Number(data.problemas ?? 0),
          })
        }
      } catch {
        // Sin badge es mejor que un toast de error en cada refresco.
      }
    }
    fetchCounts()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchCounts() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pathname])

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
        <NavList pathname={pathname} onClose={() => {}} counts={counts} />
        <div className="p-3 border-t border-admin-line">
          <div className="flex items-center gap-2.5 px-3 pb-2.5">
            <span className="w-7 h-7 rounded-full bg-champagne-soft border border-champagne-soft/60 flex items-center justify-center text-[0.65rem] font-semibold text-champagne-deep shrink-0">
              {initials}
            </span>
            <span className="text-[0.68rem] text-ink-subtle truncate">{adminEmail}</span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:shadow-focus-ring"
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
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
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
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="absolute right-1.5 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-admin-surface hover:text-ink focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
              <Logomark />
              <NavList pathname={pathname} onClose={() => setOpen(false)} counts={counts} />
              <div className="p-3 border-t border-admin-line">
                <div className="flex items-center gap-2.5 px-3 pb-2.5">
                  <span className="w-7 h-7 rounded-full bg-champagne-soft flex items-center justify-center text-[0.65rem] font-semibold text-champagne-deep shrink-0">
                    {initials}
                  </span>
                  <span className="text-[0.68rem] text-ink-subtle truncate">{adminEmail}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:shadow-focus-ring"
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
