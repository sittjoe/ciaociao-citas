import { NextResponse } from 'next/server'
import { generateSlots } from '@/lib/slot-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Generador de horarios BAJO DEMANDA (ya NO corre como cron).
 *
 * Decisión del negocio (jul 2026): los horarios se publican A MANO cada
 * semana — este endpoint se retiró de vercel.json y en su lugar el cron
 * /api/cron/slots-reminder envía un recordatorio a los admins cada lunes.
 * Se conserva como herramienta manual (curl con CRON_SECRET) por si algún
 * día se quiere rellenar el calendario según config/slotSchedule.
 *
 * La lógica vive en lib/slot-generator (compartida con el botón «Publicar
 * semanas» del panel, /api/admin/slots/publish); este route solo autentica
 * y delega.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { created, skipped, blockedDays, schedules } = await generateSlots()
    return NextResponse.json({ ok: true, created, skipped, blockedDays, schedules })
  } catch (err) {
    console.error('GET /api/cron/generate-slots', err)
    return NextResponse.json({ error: 'Error al generar horarios' }, { status: 500 })
  }
}
