import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { formatInTimeZone } from 'date-fns-tz'
import { requireAdminSession } from '@/lib/admin-auth'
import {
  appointmentTypeLabels,
  commercialStatusLabels,
  engagementBriefRows,
  getCommercialPriority,
  normalizeAppointmentType,
} from '@/lib/commercial'
import { csvRow, BUSINESS_TZ } from '@/lib/utils'
import type { AppointmentStatus, CommercialPriority, CommercialStatus } from '@/types'

export const dynamic = 'force-dynamic'

// Export CSV del servidor: acepta los MISMOS filtros que GET /api/admin/appointments
// y streamea TODAS las filas que matcheen paginando Firestore internamente.
const MAX_ROWS  = 5000
const PAGE_SIZE = 500

// Mismos estados comerciales cerrados que el GET de citas.
const CLOSED_COMMERCIAL_STATUSES = new Set(['purchased', 'not_purchased'])

const statusLabels: Record<AppointmentStatus, string> = {
  pending:   'Pendiente',
  accepted:  'Aceptada',
  rejected:  'Rechazada',
  cancelled: 'Cancelada',
}

const priorityLabels: Record<CommercialPriority, string> = {
  high:   'Alta',
  medium: 'Media',
  normal: 'Normal',
}

function cdmx(value: unknown, pattern = 'dd/MM/yyyy HH:mm'): string {
  return value instanceof Timestamp ? formatInTimeZone(value.toDate(), BUSINESS_TZ, pattern) : ''
}

interface ExportFilters {
  search: string | null
  productType: string | null
  appointmentType: string | null
  budgetRange: string | null
  priority: string | null
  commercialStatus: string | null
  clientConfirmed: string | null
  attended: string | null
  followUpDue: string | null
  endOfTodayCdmx: number
}

/** Réplica exacta de los filtros en memoria del GET /api/admin/appointments. */
function matchesFilters(d: FirebaseFirestore.DocumentData, f: ExportFilters): boolean {
  if (f.search) {
    const q = f.search.toLowerCase()
    const hit =
      String(d.name  ?? '').toLowerCase().includes(q) ||
      String(d.email ?? '').toLowerCase().includes(q) ||
      String(d.phone ?? '').toLowerCase().includes(q) ||
      String(d.confirmationCode ?? '').toLowerCase().includes(q) ||
      String(d.productType ?? '').toLowerCase().includes(q) ||
      String(d.budgetRange ?? '').toLowerCase().includes(q) ||
      String(d.lookingFor ?? '').toLowerCase().includes(q)
    if (!hit) return false
  }
  if (f.priority) {
    const p = getCommercialPriority({
      productType: d.productType,
      budgetRange: d.budgetRange,
      lookingFor: d.lookingFor,
    })
    if (p !== f.priority) return false
  }
  if (f.productType && String(d.productType ?? '') !== f.productType) return false
  if (f.appointmentType && normalizeAppointmentType(d.appointmentType) !== f.appointmentType) return false
  if (f.budgetRange && String(d.budgetRange ?? '') !== f.budgetRange) return false
  if (f.commercialStatus === 'pending') {
    if (d.commercialStatus && d.commercialStatus !== 'pending') return false
  } else if (f.commercialStatus) {
    if (String(d.commercialStatus ?? '') !== f.commercialStatus) return false
  }
  if (f.clientConfirmed === 'false') {
    if (!(d.status === 'accepted' && d.clientConfirmed !== true)) return false
  }
  if (f.attended === 'false' && d.attended !== false) return false
  if (f.followUpDue === '1') {
    const followUpAt = d.followUpAt
    if (!(followUpAt instanceof Timestamp)) return false
    if (CLOSED_COMMERCIAL_STATUSES.has(String(d.commercialStatus ?? ''))) return false
    if (followUpAt.toMillis() > f.endOfTodayCdmx) return false
  }
  return true
}

function toCsvLine(d: FirebaseFirestore.DocumentData): string {
  const type = normalizeAppointmentType(d.appointmentType)
  const status = String(d.status ?? '') as AppointmentStatus
  const commercialStatus = String(d.commercialStatus ?? 'pending') as CommercialStatus
  const priority = getCommercialPriority({
    productType: d.productType,
    budgetRange: d.budgetRange,
    lookingFor: d.lookingFor,
  })
  return csvRow([
    String(d.confirmationCode ?? ''),
    appointmentTypeLabels[type],
    String(d.name ?? ''),
    String(d.email ?? ''),
    String(d.phone ?? ''),
    cdmx(d.slotDatetime),
    statusLabels[status] ?? status,
    priorityLabels[priority],
    commercialStatusLabels[commercialStatus] ?? commercialStatus,
    String(d.productType ?? ''),
    String(d.budgetRange ?? ''),
    String(d.lookingFor ?? ''),
    engagementBriefRows(d.engagementBrief ?? null).map(([label, value]) => `${label}: ${value}`).join(' | '),
    String(d.meetingUrl ?? ''),
    String(d.notes ?? ''),
    String(d.internalNote ?? ''),
    cdmx(d.followUpAt),
    String(d.decidedBy ?? ''),
    d.clientConfirmed === true ? 'Sí' : 'No',
    d.attended === true ? 'Sí' : d.attended === false ? 'No' : '',
    Number(d.guestCount ?? 0),
    d.whatsapp === true ? 'Sí' : 'No',
    cdmx(d.createdAt),
  ])
}

const HEADER = csvRow([
  'Código', 'Tipo', 'Nombre', 'Email', 'Teléfono', 'Fecha', 'Estado', 'Prioridad',
  'Seguimiento', 'Producto', 'Presupuesto', 'Busca', 'Brief anillo', 'Meeting link',
  'Notas cliente', 'Nota interna', 'Follow-up', 'Aprobado por', 'Confirmó cliente',
  'Asistió', 'Invitados', 'WhatsApp', 'Creada',
])

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status   = searchParams.get('status')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')

  // CDMX es UTC-6 fijo (sin horario de verano desde 2022) — mismo criterio
  // que el GET de citas para el filtro de follow-up vencido.
  const todayCdmx = formatInTimeZone(new Date(), BUSINESS_TZ, 'yyyy-MM-dd')
  const filters: ExportFilters = {
    search:           searchParams.get('search'),
    productType:      searchParams.get('productType'),
    appointmentType:  searchParams.get('appointmentType'),
    budgetRange:      searchParams.get('budgetRange'),
    priority:         searchParams.get('priority'),
    commercialStatus: searchParams.get('commercialStatus'),
    clientConfirmed:  searchParams.get('clientConfirmed'),
    attended:         searchParams.get('attended'),
    followUpDue:      searchParams.get('followUpDue'),
    endOfTodayCdmx:   new Date(`${todayCdmx}T23:59:59.999-06:00`).getTime(),
  }

  try {
    // Misma forma de query que el GET de citas: rango de fechas → orderBy
    // slotDatetime; sin rango → orderBy createdAt desc (índices existentes).
    let query = (
      dateFrom || dateTo
        ? adminDb.collection('appointments').orderBy('slotDatetime', 'asc')
        : adminDb.collection('appointments').orderBy('createdAt', 'desc')
    ) as FirebaseFirestore.Query

    if (status)   query = query.where('status', '==', status)
    if (dateFrom) query = query.where('slotDatetime', '>=', Timestamp.fromDate(new Date(dateFrom)))
    if (dateTo)   query = query.where('slotDatetime', '<',  Timestamp.fromDate(new Date(dateTo)))

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // BOM UTF-8 para que Excel es-MX abra acentos y eñes sin asistente.
          controller.enqueue(encoder.encode('﻿' + HEADER + '\r\n'))

          let written = 0
          let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null

          while (written < MAX_ROWS) {
            let page = query.limit(PAGE_SIZE)
            if (cursor) page = page.startAfter(cursor)
            const snap = await page.get()
            if (snap.empty) break
            cursor = snap.docs[snap.docs.length - 1]

            let chunk = ''
            for (const doc of snap.docs) {
              if (written >= MAX_ROWS) break
              const d = doc.data()
              if (!matchesFilters(d, filters)) continue
              chunk += toCsvLine(d) + '\r\n'
              written++
            }
            if (chunk) controller.enqueue(encoder.encode(chunk))
            if (snap.docs.length < PAGE_SIZE) break
          }

          controller.close()
        } catch (err) {
          console.error('GET /api/admin/appointments/export (stream)', err)
          controller.error(err)
        }
      },
    })

    const stamp = formatInTimeZone(new Date(), BUSINESS_TZ, 'yyyyMMdd-HHmm')
    return new NextResponse(stream, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="citas-ciaociao-${stamp}.csv"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('GET /api/admin/appointments/export', err)
    return NextResponse.json({ error: 'Error al exportar citas' }, { status: 500 })
  }
}
