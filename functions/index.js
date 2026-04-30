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
    // El secret se inyecta automáticamente como process.env.ADMIN_PASSWORD_HASH en runtime
    secrets: ['ADMIN_PASSWORD_HASH'],
    region: 'us-central1',
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
