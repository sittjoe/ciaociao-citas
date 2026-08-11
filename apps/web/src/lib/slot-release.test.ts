import { describe, expect, it, vi } from 'vitest'
import { liberarSlotDeCita, slotNacioDeAltaManual } from './slot-release'

/* Esta regla decide si un horario vuelve al calendario público o se borra. Equivocarse en un
   sentido anuncia las 3 de la mañana como reservable; en el otro, BORRA un horario legítimo
   de la agenda publicada. Por eso va probada. */

function txFalso() {
  return { update: vi.fn(), delete: vi.fn() } as unknown as FirebaseFirestore.Transaction & {
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}
const slotFalso = { id: '1786000000000' } as unknown as FirebaseFirestore.DocumentReference

describe('un horario que nació de un alta manual se borra, no se libera', () => {
  it('lo borra cuando la cita lo creó', () => {
    const tx = txFalso()
    liberarSlotDeCita(tx, slotFalso, { slotCreatedManually: true })
    expect(tx.delete).toHaveBeenCalledWith(slotFalso)
    expect(tx.update).not.toHaveBeenCalled()
  })

  it('lo devuelve al público cuando la cita usó un horario ya publicado', () => {
    const tx = txFalso()
    liberarSlotDeCita(tx, slotFalso, { slotCreatedManually: false })
    expect(tx.update).toHaveBeenCalledWith(slotFalso, { available: true, bookedBy: null, heldUntil: null })
    expect(tx.delete).not.toHaveBeenCalled()
  })

  /* Todas las citas anteriores a esta función no tienen el campo. Deben seguir liberándose
     como siempre: un `undefined` interpretado como "manual" borraría horarios publicados. */
  it('una cita vieja, sin el campo, se libera como siempre', () => {
    for (const data of [undefined, {}, { slotCreatedManually: undefined }, { slotCreatedManually: null }]) {
      const tx = txFalso()
      liberarSlotDeCita(tx, slotFalso, data as FirebaseFirestore.DocumentData | undefined)
      expect(tx.update).toHaveBeenCalledTimes(1)
      expect(tx.delete).not.toHaveBeenCalled()
    }
  })

  it('solo el booleano true cuenta: nada de valores "parecidos a verdadero"', () => {
    for (const valor of ['true', 1, 'manual_admin', {}]) {
      expect(slotNacioDeAltaManual({ slotCreatedManually: valor })).toBe(false)
    }
    expect(slotNacioDeAltaManual({ slotCreatedManually: true })).toBe(true)
  })
})
