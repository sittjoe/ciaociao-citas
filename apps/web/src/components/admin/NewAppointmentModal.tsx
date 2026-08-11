'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Clock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatInTimeZone } from 'date-fns-tz'
import { BUSINESS_TZ } from '@/lib/utils'
import { appointmentTypeLabels } from '@/lib/commercial'
import { appointmentTypeOptions } from '@/lib/schemas'
import type { AppointmentType } from '@/types'

/* Alta manual de una cita, para la clienta frecuente que cierra por WhatsApp.
   Pide lo mínimo —nombre, teléfono y correo— porque el acuerdo ya se hizo en el chat:
   no se pide identificación ni el brief de preferencias del formulario público.
   La cita nace confirmada y el correo con su fecha, su código y el .ics sale al instante. */

interface SlotLibre {
  id: string
  datetime: string
  available: boolean
  slotType: AppointmentType
}

interface Props {
  open: boolean
  onClose: () => void
  /** Se llama al crear, para que la tabla se recargue. */
  onCreated: () => void
}

const hoyEnCasa = () => formatInTimeZone(new Date(), BUSINESS_TZ, 'yyyy-MM-dd')

export function NewAppointmentModal({ open, onClose, onCreated }: Props) {
  const [tipo, setTipo]       = useState<AppointmentType>('showroom')
  const [nombre, setNombre]   = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo]   = useState('')
  const [nota, setNota]       = useState('')
  const [enlace, setEnlace]   = useState('')

  // Modo del horario: uno de los publicados, o una hora escrita a mano.
  const [modo, setModo]       = useState<'publicado' | 'libre'>('publicado')
  const [slotId, setSlotId]   = useState('')
  const [fecha, setFecha]     = useState('')
  const [hora, setHora]       = useState('')

  const [slots, setSlots]     = useState<SlotLibre[]>([])
  const [cargandoSlots, setCargandoSlots] = useState(false)
  /** La lista de horarios ya terminó de cargar al menos una vez (no es lo mismo que
      «no está cargando»: al abrir, ambas cosas son falsas y la lista está vacía). */
  const [slotsCargados, setSlotsCargados] = useState(false)
  /** Se incrementa para forzar una recarga de la lista (p. ej. tras un choque). */
  const [recarga, setRecarga] = useState(0)
  const [guardando, setGuardando] = useState(false)

  const limpiar = useCallback(() => {
    setNombre(''); setTelefono(''); setCorreo(''); setNota(''); setEnlace('')
    setSlotId(''); setFecha(''); setHora(''); setModo('publicado'); setTipo('showroom')
  }, [])

  // Horarios libres del tipo elegido. Se recargan al abrir y al cambiar de tipo, porque
  // un slot de showroom no sirve para una video consulta (el servidor lo rechaza).
  useEffect(() => {
    if (!open) return
    let vigente = true
    setCargandoSlots(true)
    setSlotsCargados(false)
    fetch('/api/admin/slots', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('slots')))
      .then((d: { slots?: SlotLibre[] }) => {
        if (!vigente) return
        const libres = (d.slots ?? []).filter(s => s.available && s.slotType === tipo)
        setSlots(libres)
        setSlotId(prev => (libres.some(s => s.id === prev) ? prev : ''))
      })
      .catch(() => { if (vigente) setSlots([]) })
      .finally(() => { if (vigente) { setCargandoSlots(false); setSlotsCargados(true) } })
    return () => { vigente = false }
  }, [open, tipo, recarga])

  // Si no hay ningún horario publicado libre, no tiene caso mostrar una lista vacía:
  // se pasa solo al modo de hora escrita a mano. Se espera a que la carga TERMINE:
  // mirando solo `!cargandoSlots` esto corría en el mismo commit que dispara el fetch
  // —lista vacía todavía— y el modal se abría SIEMPRE en «Otra hora», aun con agenda
  // publicada llena, empujando cada alta al camino que crea horarios nuevos.
  useEffect(() => {
    if (open && slotsCargados && slots.length === 0) setModo('libre')
  }, [open, slotsCargados, slots.length])

  const esVideo = tipo === 'video_engagement_rings'

  const cerrar = () => { if (!guardando) { limpiar(); onClose() } }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (guardando) return

    if (modo === 'publicado' && !slotId) { toast.error('Elige un horario'); return }
    if (modo === 'libre' && (!fecha || !hora)) { toast.error('Escribe la fecha y la hora'); return }

    setGuardando(true)
    try {
      const res = await fetch('/api/admin/appointments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentType: tipo,
          name: nombre.trim(),
          email: correo.trim(),
          phone: telefono.trim(),
          notes: nota.trim(),
          ...(esVideo && enlace.trim() ? { meetingUrl: enlace.trim() } : {}),
          ...(modo === 'publicado' ? { slotId } : { date: fecha, time: hora }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'No se pudo crear la cita')
        // 404/409 = la lista de horarios que se ve ya no es la que hay en la agenda
        // (alguien reservó o borró ese horario mientras se llenaba el formulario).
        // Se suelta la selección muerta y se recarga, o se reintentaría igual.
        if ((res.status === 409 || res.status === 404) && modo === 'publicado') {
          setSlotId('')
          setRecarga(n => n + 1)
        }
        return
      }
      toast.success(`Cita confirmada · código ${data.confirmationCode}. Ya le llegó su correo.`)
      if (data.blockedDateWarning) toast.warning(data.blockedDateWarning)
      if (data.calendarSyncFailed) {
        toast.warning('La cita quedó y el correo salió, pero no se pudo agregar a Google Calendar.')
      }
      limpiar()
      onCreated()
      onClose()
    } catch {
      toast.error('No se pudo crear la cita')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal open={open} onClose={cerrar} title="Nueva cita a mano" size="lg">
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Para una clienta que ya acordó contigo por WhatsApp. La cita queda confirmada y
          recibe de inmediato su correo con la fecha, el código y el archivo de calendario,
          más los recordatorios de 24 y 2 horas antes.
        </p>

        <div>
          <label htmlFor="na-tipo" className="label-clean">Tipo de cita</label>
          <select
            id="na-tipo"
            value={tipo}
            onChange={e => setTipo(e.target.value as AppointmentType)}
            className="input-clean mt-1"
          >
            {appointmentTypeOptions.map(o => (
              <option key={o} value={o}>{appointmentTypeLabels[o]}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="na-nombre" className="label-clean">Nombre</label>
            <input
              id="na-nombre" value={nombre} onChange={e => setNombre(e.target.value)}
              required minLength={3} maxLength={100} autoComplete="off"
              placeholder="Nombre y apellido"
              className="input-clean mt-1"
            />
          </div>
          <div>
            <label htmlFor="na-tel" className="label-clean">Teléfono</label>
            <input
              id="na-tel" value={telefono} onChange={e => setTelefono(e.target.value)}
              required minLength={8} maxLength={20} inputMode="tel" autoComplete="off"
              placeholder="55 1234 5678"
              className="input-clean mt-1"
            />
          </div>
          <div>
            <label htmlFor="na-mail" className="label-clean">Correo</label>
            <input
              id="na-mail" type="email" value={correo} onChange={e => setCorreo(e.target.value)}
              required maxLength={200} inputMode="email" autoComplete="off"
              placeholder="nombre@correo.com"
              className="input-clean mt-1"
            />
            <p className="mt-1 text-xs text-ink-subtle">Aquí llega la confirmación: revisa que esté bien escrito.</p>
          </div>
        </div>

        {/* Horario */}
        <fieldset className="rounded-2xl border border-admin-line bg-admin-panel p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Horario</legend>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setModo('publicado')}
              aria-pressed={modo === 'publicado'}
              disabled={slots.length === 0}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-40 ${
                modo === 'publicado'
                  ? 'border-champagne-solid bg-champagne-solid text-white'
                  : 'border-ink-line bg-admin-surface text-ink-muted hover:text-ink'
              }`}
            >
              <Clock size={14} strokeWidth={1.5} /> De la agenda
            </button>
            <button
              type="button"
              onClick={() => setModo('libre')}
              aria-pressed={modo === 'libre'}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
                modo === 'libre'
                  ? 'border-champagne-solid bg-champagne-solid text-white'
                  : 'border-ink-line bg-admin-surface text-ink-muted hover:text-ink'
              }`}
            >
              <CalendarPlus size={14} strokeWidth={1.5} /> Otra hora
            </button>
          </div>

          {modo === 'publicado' ? (
            <div>
              <label htmlFor="na-slot" className="label-clean">Horarios libres</label>
              <select
                id="na-slot" value={slotId} onChange={e => setSlotId(e.target.value)}
                className="input-clean mt-1" disabled={cargandoSlots}
              >
                <option value="">{cargandoSlots ? 'Cargando…' : 'Elige un horario'}</option>
                {slots.map(s => (
                  <option key={s.id} value={s.id}>
                    {formatInTimeZone(new Date(s.datetime), BUSINESS_TZ, "EEEE d 'de' MMMM · HH:mm")}
                  </option>
                ))}
              </select>
              {!cargandoSlots && slots.length === 0 && (
                <p className="mt-1 text-xs text-ink-subtle">
                  No hay horarios publicados libres para este tipo de cita. Usa «Otra hora».
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="na-fecha" className="label-clean">Fecha</label>
                <input
                  id="na-fecha" type="date" value={fecha} min={hoyEnCasa()}
                  onChange={e => setFecha(e.target.value)}
                  className="input-clean mt-1"
                />
              </div>
              <div>
                <label htmlFor="na-hora" className="label-clean">Hora</label>
                <input
                  id="na-hora" type="time" value={hora} step={300}
                  onChange={e => setHora(e.target.value)}
                  className="input-clean mt-1"
                />
              </div>
              <p className="text-xs text-ink-subtle sm:col-span-2">
                Hora de Ciudad de México. El horario se crea y queda ocupado, para que nadie
                más lo reserve. Si ya hay una cita a esa hora, el sistema no te deja.
              </p>
            </div>
          )}
        </fieldset>

        {/* El enlace se pide AL CREAR, no después: los recordatorios de 24h y 2h se
            programan en este instante y su texto queda congelado. Si se agrega más tarde,
            esos correos ya salieron diciendo «pendiente por enviar». */}
        {esVideo && (
          <div>
            <label htmlFor="na-enlace" className="label-clean">Enlace de la videollamada</label>
            <input
              id="na-enlace" type="url" value={enlace} onChange={e => setEnlace(e.target.value)}
              maxLength={500} inputMode="url" autoComplete="off"
              placeholder="https://meet.google.com/..."
              className="input-clean mt-1"
            />
            <p className="mt-1 text-xs text-ink-subtle">
              Si lo dejas vacío, sus recordatorios de 24 y 2 horas antes dirán «pendiente por
              enviar» aunque después agregues el enlace: esos correos se programan ahora.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="na-nota" className="label-clean">Nota (opcional)</label>
          <textarea
            id="na-nota" value={nota} onChange={e => setNota(e.target.value)}
            maxLength={500} rows={2}
            placeholder="Qué viene a ver, con quién habló, lo que quieras recordar"
            className="input-clean mt-1"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear y confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
