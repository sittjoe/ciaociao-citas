/* ============================================================
   Devolver (o no) un horario al calendario público
   ============================================================
   Cuando una cita se cancela o se mueve, su horario vuelve a quedar libre. Eso es lo
   correcto para un horario PUBLICADO: se abrió para el público y al público regresa.

   Pero un alta manual puede haber CREADO ese horario sobre la marcha, para una hora que
   nunca estuvo en la agenda —«te veo el jueves a las 3 de la mañana»—. Devolver esa hora
   al pool la anuncia como reservable a cualquiera que entre a la página. Por eso, cuando
   el horario nació de un alta manual, se BORRA en vez de liberarse.

   Si esa hora sí era de las normales (11:00, por ejemplo), no se pierde nada: la siguiente
   «Publicar semanas» la vuelve a crear, porque el generador la reconoce por su id, que es
   el epoch ms de su fecha y hora.

   La marca vive en la CITA (`slotCreatedManually`), no en el horario, para no tener que
   leer el documento del horario dentro de la transacción: en Firestore toda lectura debe
   ir antes de cualquier escritura, y esa regla ya tumbó /api/slots una vez.
   OJO al reagendar: la cita se muda a un horario publicado, así que la marca debe apagarse
   — si no, una cancelación posterior borraría un horario legítimo de la agenda. */

export function slotNacioDeAltaManual(citaData: FirebaseFirestore.DocumentData | undefined): boolean {
  return citaData?.slotCreatedManually === true
}

export function liberarSlotDeCita(
  tx: FirebaseFirestore.Transaction,
  slotRef: FirebaseFirestore.DocumentReference,
  citaData: FirebaseFirestore.DocumentData | undefined,
) {
  if (slotNacioDeAltaManual(citaData)) {
    tx.delete(slotRef)
    return
  }
  tx.update(slotRef, { available: true, bookedBy: null, heldUntil: null })
}
