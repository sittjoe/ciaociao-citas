/**
 * Cloud Functions - CiaoCiao Citas
 * adminLogin: verifica contraseña hasheada y emite custom token con claim admin:true
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const bcrypt = require('bcryptjs');

initializeApp();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

exports.adminLogin = onCall(
  {
    secrets: ['ADMIN_PASSWORD_HASH'],
    region: 'us-central1',
    invoker: 'public',
  },
  async (request) => {
    const { password } = request.data;
    if (!password || typeof password !== 'string' || password.length > 200) {
      throw new HttpsError('invalid-argument', 'Contraseña requerida');
    }

    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) {
      throw new HttpsError('internal', 'Configuración del servidor incompleta');
    }

    const db = getFirestore();
    const ip = (request.rawRequest.headers['x-forwarded-for'] || request.rawRequest.ip || 'unknown')
      .split(',')[0]
      .trim();
    const attemptRef = db.collection('loginAttempts').doc(ip);

    // Verificar rate limit
    const attemptDoc = await attemptRef.get();
    const now = Date.now();
    if (attemptDoc.exists) {
      const data = attemptDoc.data();
      const windowEnd = data.firstAt.toMillis() + LOCKOUT_MS;
      if (data.count >= MAX_ATTEMPTS && now < windowEnd) {
        const minutesLeft = Math.ceil((windowEnd - now) / 60000);
        throw new HttpsError(
          'resource-exhausted',
          `Demasiados intentos fallidos. Espera ${minutesLeft} minuto(s).`
        );
      }
      if (now >= windowEnd) {
        await attemptRef.delete().catch(() => {});
      }
    }

    const valid = await bcrypt.compare(password, hash);

    // Registrar en auditLog (fire-and-forget)
    db.collection('auditLog').add({
      ts: Timestamp.now(),
      action: 'admin_login',
      actorIp: ip,
      success: valid,
    }).catch(console.error);

    if (!valid) {
      const doc = await attemptRef.get();
      if (!doc.exists || now >= (doc.data()?.firstAt?.toMillis() ?? 0) + LOCKOUT_MS) {
        await attemptRef.set({ count: 1, firstAt: Timestamp.now() });
      } else {
        await attemptRef.update({ count: FieldValue.increment(1) });
      }
      throw new HttpsError('unauthenticated', 'Contraseña incorrecta');
    }

    await attemptRef.delete().catch(() => {});

    const token = await getAuth().createCustomToken('shared-admin', { admin: true });
    return { token };
  }
);

// TODO(onAppointmentWritten): server-side double-booking invariant guard.
//
// The Next.js API routes already use Firestore transactions to prevent two
// concurrent submissions from booking the same slot, but a Cloud Function
// trigger gives us a second line of defence against:
//   - direct Firestore writes that bypass the API (e.g. emulator / scripts)
//   - rules misconfigurations
//   - replicated multi-region anomalies
//
// Pattern (drop-in once we add a `firebase-functions/v2/firestore` import):
//
//   const { onDocumentWritten } = require('firebase-functions/v2/firestore');
//
//   exports.onAppointmentWritten = onDocumentWritten(
//     'appointments/{id}',
//     async (event) => {
//       const after = event.data?.after?.data();
//       if (!after || (after.status !== 'pending' && after.status !== 'accepted')) return;
//
//       const db = getFirestore();
//       const dupes = await db.collection('appointments')
//         .where('slotId', '==', after.slotId)
//         .where('status', 'in', ['pending', 'accepted'])
//         .get();
//
//       if (dupes.size <= 1) return;
//
//       // Two or more active appointments for the same slot — keep the
//       // earliest, reject the newest as a double-booking, audit it.
//       const sorted = dupes.docs.sort((a, b) =>
//         (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0)
//       );
//       const newest = sorted[sorted.length - 1];
//
//       if (newest.id !== event.params.id) return; // only the newest write reacts
//
//       await db.collection('auditLog').add({
//         ts: Timestamp.now(),
//         action: 'double_booking_detected',
//         slotId: after.slotId,
//         appointmentIds: dupes.docs.map(d => d.id),
//         rejectedId: newest.id,
//       });
//
//       await newest.ref.update({
//         status: 'rejected',
//         adminNote: 'Rechazada automáticamente: doble reserva detectada.',
//         decidedAt: FieldValue.serverTimestamp(),
//         decidedBy: 'system:onAppointmentWritten',
//       });
//     }
//   );
