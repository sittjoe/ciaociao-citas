import { google, calendar_v3 } from 'googleapis'
import { adminDb } from './firebase-admin'
import { formatDate, formatTime, redactPII } from './utils'
import { engagementBriefRows, isVideoEngagement } from './commercial'
import { mapAppointmentForEmail } from './appointment-email'
import type { Appointment } from '@/types'

const DEFAULT_LOCATION = process.env.GOOGLE_CALENDAR_LOCATION || 'Showroom Ciao Ciao Joyería'
const APPOINTMENT_DURATION_MS = 60 * 60 * 1000

let calendarClient: calendar_v3.Calendar | null = null

function readCalendarCredentials() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim()
  const clientEmail = (
    process.env.GOOGLE_CLIENT_EMAIL
    || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  )?.trim()
  const privateKey = (
    process.env.GOOGLE_PRIVATE_KEY
    || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  )?.replace(/\\n/g, '\n').trim()

  return { calendarId, clientEmail, privateKey }
}

export function getGoogleCalendarConfigStatus() {
  const { calendarId, clientEmail, privateKey } = readCalendarCredentials()
  const configured = Boolean(calendarId && clientEmail && privateKey)

  return {
    configured,
    calendarId: Boolean(calendarId),
    clientEmail: Boolean(clientEmail),
    privateKey: Boolean(privateKey),
    usingDedicatedCredentials: Boolean(clientEmail && privateKey),
    missing: [
      !calendarId ? 'GOOGLE_CALENDAR_ID' : null,
      !clientEmail ? 'GOOGLE_CLIENT_EMAIL or GOOGLE_SERVICE_ACCOUNT_EMAIL' : null,
      !privateKey ? 'GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY' : null,
    ].filter(Boolean),
  }
}

export function isGoogleCalendarConfigured(): boolean {
  return getGoogleCalendarConfigStatus().configured
}

function getCalendar(): calendar_v3.Calendar {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar env vars not configured')
  }
  if (calendarClient) return calendarClient

  const { clientEmail, privateKey } = readCalendarCredentials()

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })

  calendarClient = google.calendar({ version: 'v3', auth })
  return calendarClient
}

function buildEventBody(appt: Appointment): calendar_v3.Schema$Event {
  const start = appt.slotDatetime
  const end   = new Date(start.getTime() + APPOINTMENT_DURATION_MS)
  const isVideo = isVideoEngagement(appt.appointmentType)
  const briefRows = engagementBriefRows(appt.engagementBrief).map(([label, value]) => `${label}: ${value}`)
  const videoRows = isVideo
    ? [
        `Modalidad: Videollamada`,
        appt.meetingProvider ? `Plataforma: ${appt.meetingProvider}` : '',
        appt.meetingUrl ? `Link: ${appt.meetingUrl}` : 'Link: pendiente por enviar',
        appt.meetingInstructions ? `Indicaciones: ${appt.meetingInstructions}` : '',
      ]
    : []

  return {
    summary:  `Ciao Ciao - ${isVideo ? 'Video anillo' : 'Showroom'} - ${appt.name}`,
    location: isVideo ? (appt.meetingUrl || 'Videollamada') : DEFAULT_LOCATION,
    description: [
      isVideo ? 'Video consulta para anillo de compromiso en Ciao Ciao Joyería.' : 'Cita confirmada en Ciao Ciao Joyería.',
      `Cliente: ${appt.name}`,
      `Email: ${appt.email}`,
      `Teléfono: ${appt.phone}`,
      `Fecha: ${formatDate(start)} ${formatTime(start)}`,
      ...videoRows,
      appt.notes ? `Notas: ${appt.notes}` : '',
      appt.productType ? `Producto: ${appt.productType}` : '',
      appt.budgetRange ? `Presupuesto: ${appt.budgetRange}` : '',
      appt.lookingFor ? `Busca: ${appt.lookingFor}` : '',
      ...briefRows,
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'America/Mexico_City' },
    end:   { dateTime: end.toISOString(),   timeZone: 'America/Mexico_City' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'email', minutes: 120 },
      ],
    },
  }
}

async function recordCalendarEvent(data: {
  appointmentId: string
  action: 'create' | 'update' | 'delete'
  ok: boolean
  googleCalendarEventId?: string
  error?: string
}) {
  try {
    await adminDb.collection('calendarEvents').add({
      ...data,
      // Google API errors can embed request payloads/credentials context and
      // client PII — keep only the first line, capped, and redact PII.
      ...(data.error ? { error: redactPII(data.error.split('\n')[0]).slice(0, 200) } : {}),
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('Unable to record calendar event:', err)
  }
}

export async function createAppointmentCalendarEvent(appt: Appointment): Promise<string> {
  const { calendarId } = readCalendarCredentials()

  try {
    const response = await getCalendar().events.insert({
      calendarId: calendarId!,
      // Service accounts cannot invite attendees without Domain-Wide Delegation.
      // Client already receives the ICS attachment via email.
      sendUpdates: 'none',
      requestBody: buildEventBody(appt),
    })

    const eventId = response.data.id
    if (!eventId) throw new Error('Google Calendar did not return an event id')

    await recordCalendarEvent({
      appointmentId: appt.id,
      action: 'create',
      ok: true,
      googleCalendarEventId: eventId,
    })
    return eventId
  } catch (err) {
    await recordCalendarEvent({
      appointmentId: appt.id,
      action: 'create',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export async function deleteAppointmentCalendarEvent(appt: Appointment): Promise<void> {
  if (!appt.googleCalendarEventId) return
  const { calendarId } = readCalendarCredentials()

  try {
    await getCalendar().events.delete({
      calendarId: calendarId!,
      eventId: appt.googleCalendarEventId,
      sendUpdates: 'none',
    })
    await recordCalendarEvent({
      appointmentId: appt.id,
      action: 'delete',
      ok: true,
      googleCalendarEventId: appt.googleCalendarEventId,
    })
  } catch (err) {
    await recordCalendarEvent({
      appointmentId: appt.id,
      action: 'delete',
      ok: false,
      googleCalendarEventId: appt.googleCalendarEventId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

/**
 * Picks up appointments flagged calendarSyncFailed (set when a create or
 * delete against Google Calendar fails) and retries them. Runs from the
 * daily reminders cron — failures self-heal within a day instead of needing
 * a human to notice the warning email.
 */
export async function retryFailedCalendarSyncs(): Promise<{ retried: number; recovered: number; errors: string[] }> {
  const result = { retried: 0, recovered: 0, errors: [] as string[] }
  if (!isGoogleCalendarConfigured()) return result

  const snap = await adminDb
    .collection('appointments')
    .where('calendarSyncFailed', '==', true)
    .limit(25)
    .get()

  for (const doc of snap.docs) {
    const data = doc.data()
    result.retried++
    try {
      if (data.status === 'accepted') {
        const appt = mapAppointmentForEmail(doc.id, data)
        await updateAppointmentCalendarEvent(appt) // creates when eventId is missing
        await doc.ref.update({ calendarSyncFailed: false })
        result.recovered++
      } else if (data.calendarPendingDeleteEventId) {
        // A cancellation whose Google delete failed; the event id was
        // stashed because the appointment doc already cleared its own.
        await getCalendar().events.delete({
          calendarId: readCalendarCredentials().calendarId!,
          eventId: data.calendarPendingDeleteEventId as string,
          sendUpdates: 'none',
        }).catch(err => {
          // 404/410 means the event is already gone — that IS recovery.
          const code = (err as { code?: number })?.code
          if (code !== 404 && code !== 410) throw err
        })
        await doc.ref.update({ calendarSyncFailed: false, calendarPendingDeleteEventId: null })
        result.recovered++
      } else {
        // Not accepted and nothing to delete: stale flag, clear it.
        await doc.ref.update({ calendarSyncFailed: false })
        result.recovered++
      }
    } catch (err) {
      result.errors.push(`${doc.id}: ${err instanceof Error ? err.message.split('\n')[0].slice(0, 120) : 'unknown'}`)
    }
  }

  return result
}

export async function updateAppointmentCalendarEvent(appt: Appointment): Promise<void> {
  const { calendarId } = readCalendarCredentials()

  // If a previous sync failed there's no eventId — create fresh instead
  if (!appt.googleCalendarEventId) {
    const newId = await createAppointmentCalendarEvent(appt)
    await adminDb.collection('appointments').doc(appt.id).update({ googleCalendarEventId: newId })
    return
  }

  try {
    await getCalendar().events.patch({
      calendarId: calendarId!,
      eventId: appt.googleCalendarEventId,
      sendUpdates: 'none',
      requestBody: buildEventBody(appt),
    })
    await recordCalendarEvent({
      appointmentId: appt.id,
      action: 'update',
      ok: true,
      googleCalendarEventId: appt.googleCalendarEventId,
    })
  } catch (err) {
    await recordCalendarEvent({
      appointmentId: appt.id,
      action: 'update',
      ok: false,
      googleCalendarEventId: appt.googleCalendarEventId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
