import Link from 'next/link'
import type { Metadata } from 'next'
import { Timestamp } from 'firebase-admin/firestore'
import { AlertTriangle, Bell, CalendarX, MailWarning, ShieldAlert, Wrench } from 'lucide-react'
import { adminDb } from '@/lib/firebase-admin'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { formatShortDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Problemas' }

type ProblemDoc = FirebaseFirestore.DocumentData & { id: string; createdAt?: string | null }

function ts(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

async function getProblems() {
  const [failedEmails, calendarAppts, guestIssues, lastRuns, waitlist] = await Promise.all([
    adminDb.collection('emailOutbox').where('status', '==', 'failed').limit(12).get(),
    adminDb.collection('appointments').where('calendarSyncFailed', '==', true).limit(12).get(),
    adminDb.collectionGroup('guests').where('status', 'in', ['pending', 'expired']).limit(30).get(),
    adminDb.collection('maintenanceRuns').orderBy('createdAt', 'desc').limit(6).get(),
    adminDb.collection('availabilityWaitlist').where('status', '==', 'new').limit(12).get(),
  ])

  const apptIds = Array.from(new Set(guestIssues.docs.map(doc => String(doc.data().appointmentId ?? '')).filter(Boolean)))
  const apptMap = new Map<string, FirebaseFirestore.DocumentData>()
  await Promise.all(apptIds.map(async id => {
    const snap = await adminDb.collection('appointments').doc(id).get()
    if (snap.exists) apptMap.set(id, snap.data()!)
  }))

  return {
    failedEmails: failedEmails.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: ts(doc.data().createdAt) })) as ProblemDoc[],
    calendarAppts: calendarAppts.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProblemDoc[],
    guestIssues: guestIssues.docs.map(doc => {
      const data = doc.data()
      const appt = apptMap.get(String(data.appointmentId))
      const slotDatetime = appt?.slotDatetime instanceof Timestamp ? appt.slotDatetime.toDate() : null
      const deadline = slotDatetime ? new Date(slotDatetime.getTime() - 24 * 60 * 60 * 1000) : null
      return {
        id: doc.id,
        appointmentId: String(data.appointmentId ?? ''),
        name: String(data.name ?? ''),
        email: String(data.email ?? ''),
        status: String(data.status ?? ''),
        hostName: String(appt?.name ?? ''),
        slotDatetime: slotDatetime?.toISOString() ?? null,
        deadline: deadline?.toISOString() ?? null,
      }
    }),
    runs: lastRuns.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: ts(doc.data().createdAt) })) as ProblemDoc[],
    waitlist: waitlist.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: ts(doc.data().createdAt) })) as ProblemDoc[],
  }
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card variant="admin" className="p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</p>
    </Card>
  )
}

export default async function ProblemasPage() {
  const data = await getProblems()
  const totalIssues = data.failedEmails.length + data.calendarAppts.length + data.guestIssues.filter(g => g.status === 'expired').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="h-eyebrow mb-2">Operación</p>
          <h1 className="font-serif text-2xl text-ink">Problemas</h1>
          <p className="text-sm text-ink-muted mt-1">Bandeja de excepciones: emails, invitados, Calendar y mantenimientos.</p>
        </div>
        <Badge className={totalIssues > 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}>
          {totalIssues > 0 ? `${totalIssues} requieren atención` : 'Sin bloqueos críticos'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Emails fallidos" value={data.failedEmails.length} tone="text-red-600" />
        <Metric label="Calendar con error" value={data.calendarAppts.length} tone="text-amber-700" />
        <Metric label="Invitados pendientes/expirados" value={data.guestIssues.length} tone="text-champagne-deep" />
        <Metric label="Lista de espera" value={data.waitlist.length} tone="text-ink" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card variant="admin">
          <CardHeader className="flex flex-row items-center gap-2">
            <Bell size={18} className="text-champagne" />
            <h2 className="font-serif text-lg text-ink">Avisos de disponibilidad</h2>
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            {data.waitlist.length === 0 ? (
              <p className="text-sm text-ink-muted">No hay personas esperando horarios.</p>
            ) : data.waitlist.map(lead => (
              <div key={lead.id} className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{String(lead.name ?? '')}</p>
                    <p className="text-xs text-ink-muted">{String(lead.email ?? '')} · {String(lead.phone ?? '')}</p>
                  </div>
                  {lead.createdAt && <span className="text-[10px] text-ink-subtle">{formatShortDate(String(lead.createdAt))}</span>}
                </div>
                {[lead.productType, lead.budgetRange].filter(Boolean).length > 0 && (
                  <p className="mt-1 text-xs text-champagne-deep">
                    {[lead.productType, lead.budgetRange].filter(Boolean).join(' · ')}
                  </p>
                )}
                {lead.message && <p className="mt-1 text-xs text-ink-muted">{String(lead.message).slice(0, 180)}</p>}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card variant="admin">
          <CardHeader className="flex flex-row items-center gap-2">
            <MailWarning size={18} className="text-red-500" />
            <h2 className="font-serif text-lg text-ink">Emails fallidos</h2>
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            {data.failedEmails.length === 0 ? (
              <p className="text-sm text-ink-muted">No hay emails fallidos en outbox.</p>
            ) : data.failedEmails.map(email => (
              <div key={email.id} className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{String(email.subject ?? 'Sin asunto')}</p>
                    <p className="text-xs text-ink-muted">{Array.isArray(email.to) ? email.to.join(', ') : ''}</p>
                  </div>
                  {email.appointmentId && <Link className="text-xs text-champagne hover:underline" href="/admin/citas">Abrir citas</Link>}
                </div>
                {email.error && <p className="mt-1 text-xs text-red-600">{String(email.error).slice(0, 180)}</p>}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card variant="admin">
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarX size={18} className="text-amber-600" />
            <h2 className="font-serif text-lg text-ink">Google Calendar</h2>
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            {data.calendarAppts.length === 0 ? (
              <p className="text-sm text-ink-muted">No hay citas con error de Calendar.</p>
            ) : data.calendarAppts.map(appt => (
              <div key={appt.id} className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2 text-sm">
                <p className="font-medium text-ink">{String(appt.name ?? '')}</p>
                <p className="text-xs text-ink-muted">{appt.slotDatetime instanceof Timestamp ? formatShortDate(appt.slotDatetime.toDate()) : 'Sin fecha'}</p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card variant="admin">
          <CardHeader className="flex flex-row items-center gap-2">
            <ShieldAlert size={18} className="text-champagne" />
            <h2 className="font-serif text-lg text-ink">Invitados</h2>
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            {data.guestIssues.length === 0 ? (
              <p className="text-sm text-ink-muted">No hay invitados pendientes o expirados.</p>
            ) : data.guestIssues.slice(0, 12).map(guest => (
              <div key={`${guest.appointmentId}-${guest.id}`} className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{guest.name}</p>
                  <Badge className={guest.status === 'expired' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}>
                    {guest.status === 'expired' ? 'Expirado' : 'Pendiente'}
                  </Badge>
                </div>
                <p className="text-xs text-ink-muted">{guest.email}</p>
                {guest.deadline && <p className="text-xs text-ink-subtle">Límite: {formatShortDate(guest.deadline)}</p>}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card variant="admin">
          <CardHeader className="flex flex-row items-center gap-2">
            <Wrench size={18} className="text-ink-muted" />
            <h2 className="font-serif text-lg text-ink">Mantenimiento</h2>
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            {data.runs.length === 0 ? (
              <p className="text-sm text-ink-muted">Aún no hay runs registrados.</p>
            ) : data.runs.map(run => (
              <div key={run.id} className="rounded-xl border border-admin-line bg-admin-surface px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{String(run.type ?? 'run')}</p>
                  <Badge className={run.ok === false ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}>
                    {run.ok === false ? 'Con errores' : 'OK'}
                  </Badge>
                </div>
                <p className="text-xs text-ink-muted">{run.createdAt ? formatShortDate(String(run.createdAt)) : 'Sin fecha'}</p>
                {Array.isArray(run.errors) && run.errors.length > 0 && (
                  <p className="mt-1 text-xs text-red-600">{run.errors[0]}</p>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="rounded-xl border border-admin-line bg-admin-panel px-4 py-3 text-xs text-ink-muted flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Los emails fallidos se reintentan automáticamente en el cron diario. También puedes reenviar manualmente desde cada cita.
      </div>
    </div>
  )
}
