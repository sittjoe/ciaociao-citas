/**
 * Cloud Functions - CiaoCiao Citas
 * adminLogin: verifica contraseña hasheada y emite custom token con claim admin:true
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const bcrypt = require('bcryptjs');

initializeApp();

const ADMIN_PASSWORD_HASH = defineSecret('ADMIN_PASSWORD_HASH');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

exports.adminLogin = onCall(
  {
    secrets: [ADMIN_PASSWORD_HASH],
    // Región cerca de México para latencia mínima
    region: 'us-central1',
  },
  async (request) => {
    const { password } = request.data;
    if (!password || typeof password !== 'string' || password.length > 200) {
      throw new HttpsError('invalid-argument', 'Contraseña requerida');
    }

    const db = getFirestore();
    // Usa IP del request como clave de rate-limit
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
      // Ventana expirada — limpiar
      if (now >= windowEnd) {
        await attemptRef.delete().catch(() => {});
      }
    }

    // Verificar contraseña contra hash bcrypt almacenado en Secret Manager
    const hash = ADMIN_PASSWORD_HASH.value();
    const valid = await bcrypt.compare(password, hash);

    // Registrar intento en auditLog (sin await para no bloquear respuesta)
    db.collection('auditLog').add({
      ts: Timestamp.now(),
      action: 'admin_login',
      actorIp: ip,
      success: valid,
    }).catch(console.error);

    if (!valid) {
      // Incrementar contador de intentos fallidos
      if (!attemptDoc.exists || now >= (attemptDoc.data()?.firstAt?.toMillis() ?? 0) + LOCKOUT_MS) {
        await attemptRef.set({ count: 1, firstAt: Timestamp.now() });
      } else {
        await attemptRef.update({ count: FieldValue.increment(1) });
      }
      throw new HttpsError('unauthenticated', 'Contraseña incorrecta');
    }

    // Login exitoso — limpiar rate limit y emitir custom token
    await attemptRef.delete().catch(() => {});

    const token = await getAuth().createCustomToken('shared-admin', { admin: true });
    return { token };
  }
);
