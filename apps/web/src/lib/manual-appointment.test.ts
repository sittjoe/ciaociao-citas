import { describe, expect, it } from 'vitest'
import { fromZonedTime } from 'date-fns-tz'
import { formatInTimeZone } from 'date-fns-tz'
import { manualAppointmentSchema } from './schemas'
import { BUSINESS_TZ } from './utils'

/* El alta manual de una cita es el único camino en el que el equipo escribe la fecha y la
   hora a mano. Dos cosas se pueden romper sin que nadie lo note hasta que la clienta llega
   el día equivocado: que se acepten las dos formas de horario a la vez (o ninguna), y que la
   hora se interprete en el huso del navegador en vez del de la casa. Eso es lo que se prueba. */

const base = {
  appointmentType: 'showroom' as const,
  name: 'María Fernanda Solís',
  email: 'MARIA@Ejemplo.com',
  phone: '+52 55 1234 5678',
}

describe('manualAppointmentSchema: el horario llega de una forma o de la otra, nunca las dos', () => {
  it('acepta un horario ya publicado', () => {
    const r = manualAppointmentSchema.safeParse({ ...base, slotId: 'abc123' })
    expect(r.success).toBe(true)
  })

  it('acepta una fecha y hora escritas a mano', () => {
    const r = manualAppointmentSchema.safeParse({ ...base, date: '2026-12-24', time: '17:30' })
    expect(r.success).toBe(true)
  })

  it('rechaza mandar las dos a la vez (ahí no se sabría cuál gana)', () => {
    const r = manualAppointmentSchema.safeParse({
      ...base, slotId: 'abc123', date: '2026-12-24', time: '17:30',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza no mandar ninguna', () => {
    const r = manualAppointmentSchema.safeParse(base)
    expect(r.success).toBe(false)
  })

  it('rechaza una fecha sin su hora', () => {
    const r = manualAppointmentSchema.safeParse({ ...base, date: '2026-12-24' })
    expect(r.success).toBe(false)
  })

  it('exige nombre, correo y teléfono válidos', () => {
    expect(manualAppointmentSchema.safeParse({ ...base, name: 'Ana', email: 'no-es-correo', slotId: 'x' }).success).toBe(false)
    expect(manualAppointmentSchema.safeParse({ ...base, phone: '123', slotId: 'x' }).success).toBe(false)
    expect(manualAppointmentSchema.safeParse({ ...base, name: 'Al', slotId: 'x' }).success).toBe(false)
  })

  it('no exige identificación ni el brief del formulario público', () => {
    const r = manualAppointmentSchema.safeParse({ ...base, slotId: 'abc123' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect('identificationUrl' in r.data).toBe(false)
      expect('engagementBrief' in r.data).toBe(false)
    }
  })

  it('la nota es opcional y tiene tope', () => {
    expect(manualAppointmentSchema.safeParse({ ...base, slotId: 'x', notes: '' }).success).toBe(true)
    expect(manualAppointmentSchema.safeParse({ ...base, slotId: 'x', notes: 'a'.repeat(501) }).success).toBe(false)
  })

  /* «24:00» pasaba el filtro y NO truena al convertirse: fromZonedTime la lee como las
     00:00 de ESE MISMO día, así que la cita quedaba 24 horas antes de lo escrito y nadie
     se enteraba hasta que la clienta llegara el día equivocado. Debe rechazarse de raíz. */
  it('rechaza horas que no existen en un reloj de 24 horas', () => {
    for (const time of ['24:00', '25:30', '10:60', '99:99', '7:30', '073:0']) {
      expect(manualAppointmentSchema.safeParse({ ...base, date: '2026-12-24', time }).success).toBe(false)
    }
  })

  it('acepta los bordes reales del reloj', () => {
    for (const time of ['00:00', '09:05', '13:00', '23:59']) {
      expect(manualAppointmentSchema.safeParse({ ...base, date: '2026-12-24', time }).success).toBe(true)
    }
  })
})

describe('la hora escrita se interpreta en el huso de la casa, no en el del navegador', () => {
  it('convierte una hora de pared de CDMX al instante correcto', () => {
    // 24-dic-2026 17:30 en CDMX (UTC-6 en invierno) son las 23:30 UTC.
    const dt = fromZonedTime('2026-12-24T17:30:00', BUSINESS_TZ)
    expect(dt.toISOString()).toBe('2026-12-24T23:30:00.000Z')
  })

  it('ida y vuelta: lo que el equipo escribe es lo que la clienta ve en su correo', () => {
    // Bordes: medianoche, último minuto del día, cambio de año, y las fechas en que
    // EEUU mueve su reloj (México ya no lo mueve desde 2022, así que no debe pasar nada).
    for (const [fecha, hora] of [
      ['2026-12-24', '17:30'], ['2026-06-15', '09:00'], ['2026-01-02', '23:45'],
      ['2026-08-11', '00:00'], ['2026-12-31', '23:59'], ['2027-01-01', '00:00'],
      ['2026-03-08', '02:30'], ['2026-11-01', '01:30'], ['2026-04-05', '02:30'],
    ]) {
      const dt = fromZonedTime(`${fecha}T${hora}:00`, BUSINESS_TZ)
      expect(Number.isNaN(dt.getTime())).toBe(false)
      expect(formatInTimeZone(dt, BUSINESS_TZ, 'yyyy-MM-dd HH:mm')).toBe(`${fecha} ${hora}`)
    }
  })

  it('una fecha que no existe se detecta, no se agenda en silencio', () => {
    // El servidor lo traduce a BAD_DATETIME → 422 «Fecha u hora inválida».
    expect(Number.isNaN(fromZonedTime('2026-02-30T10:00:00', BUSINESS_TZ).getTime())).toBe(true)
    expect(Number.isNaN(fromZonedTime('2026-13-01T10:00:00', BUSINESS_TZ).getTime())).toBe(true)
  })
})
