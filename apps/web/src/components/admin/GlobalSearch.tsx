'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, X, CalendarDays, UserCheck, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppointmentHit { type: 'appointment'; id: string; title: string; subtitle: string; href: string; status?: string }
interface SlotHit        { type: 'slot';        id: string; title: string; subtitle: string; href: string }
interface GuestHit       { type: 'guest';       id: string; appointmentId: string; title: string; subtitle: string; href: string }
type Hit = AppointmentHit | SlotHit | GuestHit

const KIND_LABEL: Record<Hit['type'], string> = {
  appointment: 'Citas',
  slot:        'Slots',
  guest:       'Invitados',
}

const KIND_ICON: Record<Hit['type'], typeof Search> = {
  appointment: CalendarDays,
  slot:        Clock3,
  guest:       UserCheck,
}

export function GlobalSearch() {
  const router = useRouter()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Cmd/Ctrl+K to focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Debounced fetch.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`)
        if (!res.ok) throw new Error()
        const data = await res.json() as { hits: Hit[] }
        if (!cancelled) {
          setHits(data.hits)
          setActiveIndex(data.hits.length > 0 ? 0 : -1)
        }
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [q])

  const navigateTo = useCallback((hit: Hit) => {
    setOpen(false)
    setQ('')
    setHits([])
    router.push(hit.href)
  }, [router])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      navigateTo(hits[activeIndex])
    }
  }

  // Group hits by kind for display.
  const grouped = hits.reduce<Record<Hit['type'], Hit[]>>((acc, h) => {
    ;(acc[h.type] ??= []).push(h)
    return acc
  }, { appointment: [], slot: [], guest: [] })

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <label htmlFor={inputId} className="sr-only">Buscar</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          ref={inputRef}
          id={inputId}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar citas, slots, invitados…"
          className="input-clean w-full pl-9 pr-16 text-sm"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${inputId}-opt-${activeIndex}` : undefined}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[0.6rem] text-ink-subtle border border-admin-line rounded-md px-1.5 py-0.5 bg-admin-surface/70 pointer-events-none">
          {isMac ? '⌘' : 'Ctrl'} K
        </span>
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); setHits([]); inputRef.current?.focus() }}
            aria-label="Limpiar búsqueda"
            className="absolute right-12 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div
          id={`${inputId}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1.5 w-full max-h-[26rem] overflow-y-auto rounded-xl border border-admin-line bg-admin-panel shadow-lift"
        >
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-ink-muted">
              <Loader2 size={14} className="animate-spin text-champagne" />
              Buscando…
            </div>
          )}
          {!loading && hits.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink-subtle text-center">
              Sin resultados para “{q.trim()}”.
            </p>
          )}
          {!loading && (
            <>
              {(['appointment', 'slot', 'guest'] as const).map(kind => {
                const group = grouped[kind]
                if (!group || group.length === 0) return null
                const Icon = KIND_ICON[kind]
                return (
                  <div key={kind} className="px-1.5 py-1.5">
                    <p className="px-2 pb-1 text-[0.6rem] uppercase tracking-wider text-ink-subtle font-semibold">
                      {KIND_LABEL[kind]}
                    </p>
                    {group.map(hit => {
                      const flatIdx = hits.indexOf(hit)
                      const active = flatIdx === activeIndex
                      return (
                        <button
                          key={`${hit.type}-${hit.id}`}
                          type="button"
                          role="option"
                          aria-selected={active}
                          id={`${inputId}-opt-${flatIdx}`}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onClick={() => navigateTo(hit)}
                          className={cn(
                            'w-full text-left rounded-lg px-2.5 py-1.5 flex items-start gap-2.5 transition-colors',
                            active ? 'bg-champagne-tint' : 'hover:bg-admin-surface',
                          )}
                        >
                          <Icon size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-champagne" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink truncate">{hit.title}</span>
                            <span className="block text-[0.7rem] text-ink-muted truncate">{hit.subtitle}</span>
                          </span>
                          {hit.type === 'appointment' && hit.status && (
                            <span className="text-[0.6rem] uppercase tracking-wider text-ink-subtle shrink-0">{hit.status}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
