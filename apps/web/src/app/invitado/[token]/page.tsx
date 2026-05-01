'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { ShieldCheck, Clock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { IDUploader } from '@/components/booking/IDUploader'
import { Button } from '@/components/ui/Button'

interface GuestInfo {
  name: string
  status: string
  identificationUrl: string | null
}

interface AppointmentInfo {
  dateStr: string
  timeStr: string
  deadlineStr: string
  hostName: string
}

type PageState = 'loading' | 'ready' | 'already_verified' | 'expired' | 'error' | 'done'

export default function InvitadoPage() {
  const { token }  = useParams<{ token: string }>()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [guest,  setGuest]        = useState<GuestInfo | null>(null)
  const [appt,   setAppt]         = useState<AppointmentInfo | null>(null)
  const [idFile, setIdFile]       = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/guests/${token}`)
      .then(async res => {
        if (res.status === 410) { setPageState('expired'); return }
        if (!res.ok)            { setPageState('error');   return }
        const data = await res.json() as { guest: GuestInfo; appointment: AppointmentInfo }
        setGuest(data.guest)
        setAppt(data.appointment)
        setPageState(data.guest.status === 'verified' ? 'already_verified' : 'ready')
      })
      .catch(() => setPageState('error'))
  }, [token])

  const submit = useCallback(async () => {
    if (!idFile) { toast.error('Selecciona tu identificación primero'); return }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('idFile', idFile)
      const res = await fetch(`/api/guests/${token}`, { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Error al verificar')
      }
      setPageState('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }, [idFile, token])

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl text-ink tracking-[4px]">CIAO CIAO</h1>
          <p className="text-[11px] text-champagne tracking-[3px] uppercase mt-1">Joyería fina · Showroom privado</p>
        </div>

        {pageState === 'loading' && (
          <div className="card-soft text-center py-12">
            <div className="h-8 w-8 border-2 border-champagne border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-ink-muted">Cargando…</p>
          </div>
        )}

        {pageState === 'error' && (
          <div className="card-soft text-center space-y-3 py-8">
            <AlertCircle size={36} className="text-red-400 mx-auto" />
            <h2 className="font-serif text-xl text-ink">Link inválido</h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              Este link de verificación no es válido o ya fue usado. Si crees que es un error, contacta a{' '}
              <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>.
            </p>
          </div>
        )}

        {pageState === 'expired' && (
          <div className="card-soft text-center space-y-3 py-8">
            <Clock size={36} className="text-amber-400 mx-auto" />
            <h2 className="font-serif text-xl text-ink">Plazo vencido</h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              El plazo para verificar tu identidad ha vencido. Contacta a{' '}
              <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>{' '}
              para que el equipo pueda ayudarte.
            </p>
          </div>
        )}

        {pageState === 'already_verified' && (
          <div className="card-soft text-center space-y-3 py-8">
            <ShieldCheck size={40} className="text-emerald-500 mx-auto" />
            <h2 className="font-serif text-xl text-ink">Ya estás verificado</h2>
            <p className="text-sm text-ink-muted">
              Tu identidad fue verificada exitosamente. Te esperamos el {appt?.dateStr} a las {appt?.timeStr}.
            </p>
          </div>
        )}

        {pageState === 'done' && (
          <div className="card-soft text-center space-y-4 py-8">
            <ShieldCheck size={48} className="text-champagne mx-auto" />
            <h2 className="font-serif text-2xl text-ink">Identidad verificada</h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              Tu identificación fue recibida correctamente. Te esperamos el{' '}
              <strong>{appt?.dateStr}</strong> a las <strong>{appt?.timeStr}</strong>.
            </p>
            <p className="text-xs text-ink-muted">Asegúrate de traer la misma identificación el día de tu visita.</p>
          </div>
        )}

        {pageState === 'ready' && guest && appt && (
          <div className="space-y-4 fade-up">
            <div className="card-soft space-y-3">
              <h2 className="font-serif text-xl text-ink">Verifica tu identidad</h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                <strong>{appt.hostName}</strong> te ha invitado a una visita privada al showroom de Ciao Ciao Joyería.
                Para poder ingresar, necesitamos verificar tu identidad.
              </p>
              <div className="divide-y divide-stone-100 text-sm">
                {([
                  ['Invitado',                 guest.name],
                  ['Fecha',                    appt.dateStr],
                  ['Hora',                     appt.timeStr],
                  ['Límite de verificación',   appt.deadlineStr],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="flex justify-between py-2">
                    <span className="text-ink-muted">{label}</span>
                    <span className="text-ink font-medium text-right max-w-[55%]">{val}</span>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
                Solo las personas con identificación verificada podrán ingresar al showroom.
              </div>
            </div>

            <div className="card-soft space-y-4">
              <div>
                <h3 className="font-medium text-ink text-sm">Sube tu identificación oficial</h3>
                <p className="text-xs text-ink-muted mt-0.5">INE, pasaporte u otra identificación vigente. JPG, PNG, WebP o PDF · máx. 5 MB.</p>
              </div>
              <IDUploader value={idFile} onChange={setIdFile} />
              <Button className="w-full" disabled={!idFile} loading={submitting} onClick={submit}>
                <ShieldCheck size={15} /> Verificar mi identidad
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-ink-muted mt-8">
          Dudas: <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>
        </p>
      </div>
    </div>
  )
}
