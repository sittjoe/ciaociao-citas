'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { ShieldCheck, Clock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from '@/components/motion'
import { Card } from '@/components/ui/Card'
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

type PageState = 'loading' | 'ready' | 'already_verified' | 'expired' | 'revoked' | 'error' | 'done'

function SpinnerArc() {
  return (
    <motion.svg
      width="40" height="40" viewBox="0 0 40 40"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
      className="mx-auto mb-4"
    >
      <circle cx="20" cy="20" r="16" fill="none" stroke="#EFE6D3" strokeWidth="2" />
      <circle
        cx="20" cy="20" r="16" fill="none"
        stroke="#B89968" strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="60 44"
      />
    </motion.svg>
  )
}

export default function InvitadoPage() {
  const { token }    = useParams<{ token: string }>()
  const [pageState,  setPageState]  = useState<PageState>('loading')
  const [guest,      setGuest]      = useState<GuestInfo | null>(null)
  const [appt,       setAppt]       = useState<AppointmentInfo | null>(null)
  const [idFile,     setIdFile]     = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/guests/${token}`)
      .then(async res => {
        if (res.status === 410) { setPageState('expired'); return }
        if (res.status === 403) { setPageState('revoked'); return }
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
        if (res.status === 410) { setPageState('expired'); return }
        if (res.status === 403) { setPageState('revoked'); return }
        if (res.status === 404) { setPageState('error');   return }
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
    <div className="relative min-h-screen overflow-hidden bg-cream px-4 py-10">
      <Image
        src="/atelier-vivo-hero.png"
        alt="Mesa de atelier con joyería fina"
        fill
        sizes="100vw"
        className="object-cover opacity-14"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.982_0.008_86/0.82),oklch(0.982_0.008_86/0.98))]" />
      <div className="relative z-10 mx-auto w-full max-w-md">

        {/* Brand header */}
        <div className="text-center mb-10">
          <h1 className="font-serif font-light text-3xl text-ink tracking-[0.12em]">CIAO CIAO</h1>
          <div className="w-8 h-px bg-champagne mx-auto my-3" />
          <p className="text-[0.6rem] text-champagne tracking-[0.32em] uppercase font-semibold">
            Joyería fina · Showroom privado
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={pageState}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {pageState === 'loading' && (
              <Card variant="atelier" className="text-center py-12">
                <SpinnerArc />
                <p className="text-sm text-ink-muted">Cargando…</p>
              </Card>
            )}

            {pageState === 'error' && (
              <Card variant="atelier" className="text-center space-y-3 px-6 py-8">
                <AlertCircle size={36} strokeWidth={1.5} className="text-red-400 mx-auto" />
                <h2 className="font-serif font-light text-xl text-ink">Link inválido</h2>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Este link no es válido o ya fue usado. Si crees que es un error, contacta a{' '}
                  <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>.
                </p>
              </Card>
            )}

            {pageState === 'expired' && (
              <Card variant="atelier" className="text-center space-y-3 px-6 py-8">
                <Clock size={36} strokeWidth={1.5} className="text-amber-400 mx-auto" />
                <h2 className="font-serif font-light text-xl text-ink">Plazo vencido</h2>
                <p className="text-sm text-ink-muted leading-relaxed">
                  El plazo para verificar tu identidad ha vencido. Contacta a{' '}
                  <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>{' '}
                  para que el equipo pueda ayudarte.
                </p>
              </Card>
            )}

            {pageState === 'revoked' && (
              <Card variant="atelier" className="text-center space-y-3 px-6 py-8">
                <AlertCircle size={36} strokeWidth={1.5} className="text-ink-subtle mx-auto" />
                <h2 className="font-serif font-light text-xl text-ink">Invitación no activa</h2>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Esta invitación ya no está activa. Si crees que es un error, contacta a{' '}
                  <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>.
                </p>
              </Card>
            )}

            {pageState === 'already_verified' && (
              <Card variant="atelier" className="text-center space-y-3 px-6 py-8">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                  <ShieldCheck size={28} strokeWidth={1.5} className="text-emerald-500" />
                </div>
                <h2 className="font-serif font-light text-xl text-ink">Ya estás verificado</h2>
                <p className="text-sm text-ink-muted">
                  Tu identidad fue verificada exitosamente. Te esperamos el {appt?.dateStr} a las {appt?.timeStr}.
                </p>
              </Card>
            )}

            {pageState === 'done' && (
              <Card variant="atelier" className="text-center space-y-4 px-6 py-8">
                <div className="w-16 h-16 rounded-full bg-champagne-tint flex items-center justify-center mx-auto">
                  <ShieldCheck size={30} strokeWidth={1.5} className="text-champagne" />
                </div>
                <h2 className="font-serif font-light text-2xl text-ink">Identidad verificada</h2>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Tu identificación fue recibida correctamente. Te esperamos el{' '}
                  <strong>{appt?.dateStr}</strong> a las <strong>{appt?.timeStr}</strong>.
                </p>
                <p className="text-xs text-ink-muted">Asegúrate de traer la misma identificación el día de tu visita.</p>
              </Card>
            )}

            {pageState === 'ready' && guest && appt && (
              <div className="space-y-4">
                <Card variant="atelier" className="space-y-4 p-6">
                  <div>
                    <p className="h-eyebrow mb-2">Invitación privada</p>
                    <h2 className="font-serif font-light text-2xl text-ink">Verifica tu identidad</h2>
                  </div>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    <strong>{appt.hostName}</strong> te ha invitado a una visita privada al showroom de Ciao Ciao Joyería.
                    Para poder ingresar, necesitamos verificar tu identidad.
                  </p>

                  <div className="divide-y divide-ink-line text-sm">
                    {([
                      ['Invitado',               guest.name],
                      ['Fecha',                  appt.dateStr],
                      ['Hora',                   appt.timeStr],
                      ['Límite de verificación', appt.deadlineStr],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="flex justify-between py-2.5">
                        <span className="text-ink-muted">{label}</span>
                        <span className="text-ink font-medium text-right max-w-[55%]">{val}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
                    Solo las personas con identificación verificada podrán ingresar al showroom.
                  </div>
                </Card>

                <Card variant="atelier" className="space-y-4 p-6">
                  <div>
                    <h3 className="font-medium text-ink text-sm">Sube tu identificación oficial</h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      INE, pasaporte u otra identificación vigente. JPG, PNG, WebP o PDF · máx. 5 MB.
                    </p>
                  </div>
                  <IDUploader value={idFile} onChange={setIdFile} />
                  <Button className="w-full" disabled={!idFile} loading={submitting} onClick={submit}>
                    <ShieldCheck size={15} strokeWidth={1.5} /> Verificar mi identidad
                  </Button>
                </Card>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-xs text-ink-muted mt-8">
          Dudas: <a href="mailto:hola@ciaociao.mx" className="text-champagne hover:underline">hola@ciaociao.mx</a>
        </p>
      </div>
    </div>
  )
}
