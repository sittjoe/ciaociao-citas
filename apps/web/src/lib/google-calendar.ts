import { google, calendar_v3 } from 'googleapis'
import { adminDb } from './firebase-admin'
import { formatDate, formatTime } from './utils'
import { getActiveAdminEmails } from './email'
import type { Appointment } from '@/types'

const DEFAULT_LOCATION = process.env.GOOGLE_CALENDAR_LOCATION || 'Showroom Ciao Ciao Joyería'

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

async function recordCalendarEvent(data: {
  appointmentId: string
  action: 'create' | 'delete'
  ok: boolean
  googleCalendarEventId?: string
  error?: string
}) {
  try {
    await adminDb.collection('calendarEvents').add({
      ...data,
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('Unable to record calendar event:', err)
  }
}

export async function createAppointmentCalendarEvent(appt: Appointment): Promise<string> {
  const { calendarId } = readCalendarCredentials()
  const start = appt.slotDatetime
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const summary = `Ciao Ciao - ${appt.name}`

  try {
    const response = await getCalendar().events.insert({
      calendarId: calendarId!,
      sendUpdates: 'all',
      requestBody: {
        summary,
        location: DEFAULT_LOCATION,
        description: [
          `Cita confirmada en Ciao Ciao Joyería.`,
          `Cliente: ${appt.name}`,
          `Email: ${appt.email}`,
          `Teléfono: ${appt.phone}`,
          `Fecha: ${formatDate(start)} ${formatTime(start)}`,
          appt.notes ? `Notas: ${appt.notes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: start.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: end.toISOString(), timeZone: 'America/Mexico_City' },
        attendees: [
          { email: appt.email, displayName: appt.name },
          ...(await getActiveAdminEmails()).map(email => ({ email })),
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 120 },
          ],
        },
      },
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
      sendUpdates: 'all',
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
