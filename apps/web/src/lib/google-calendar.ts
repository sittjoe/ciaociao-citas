import { google, calendar_v3 } from 'googleapis'
import { adminDb } from './firebase-admin'
import { formatDate, formatTime } from './utils'
import { getActiveAdminEmails } from './email'
import type { Appointment } from '@/types'

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID
const DEFAULT_LOCATION = process.env.GOOGLE_CALENDAR_LOCATION || 'Showroom Ciao Ciao Joyería'

let calendarClient: calendar_v3.Calendar | null = null

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    CALENDAR_ID &&
    (process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL) &&
    (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)
  )
}

function getCalendar(): calendar_v3.Calendar {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar env vars not configured')
  }
  if (calendarClient) return calendarClient

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    || process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (
    process.env.GOOGLE_PRIVATE_KEY
    || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    || process.env.FIREBASE_PRIVATE_KEY
  )?.replace(/\\n/g, '\n')

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
  const start = appt.slotDatetime
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const summary = `Ciao Ciao - ${appt.name}`

  try {
    const response = await getCalendar().events.insert({
      calendarId: CALENDAR_ID!,
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

  try {
    await getCalendar().events.delete({
      calendarId: CALENDAR_ID!,
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
