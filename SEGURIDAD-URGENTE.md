# Nota histórica de seguridad

> Este archivo originalmente listaba en texto plano la contraseña y las API
> keys que estuvieron expuestas. Esa información se removió del repositorio.
> Lo que queda es la bitácora de qué pasó y dónde está la configuración hoy.

## Incidente

En **octubre de 2025** se detectó que `firebase-config.js`, con credenciales
reales, estuvo versionado en GitHub durante varios commits. Las credenciales
afectadas fueron:

- Firebase Web API key del proyecto
- EmailJS Public Key
- Contraseña de admin (autenticación simple, sin hash en ese entonces)
- Email del admin

## Acciones aplicadas

1. `firebase-config.js` agregado a `.gitignore` y removido del historial completo
   (history rewrite + force push).
2. Las API keys de Firebase y EmailJS fueron regeneradas en sus respectivas
   consolas y los valores antiguos quedaron inutilizables.
3. La autenticación de admin se migró a Cloud Function (`functions/index.js` ->
   `adminLogin`) con:
   - Contraseña almacenada como **hash bcrypt** en el secret
     `ADMIN_PASSWORD_HASH` (Google Secret Manager).
   - Rate limiting por IP (5 intentos / 15 min) registrado en
     `loginAttempts/{ip}`.
   - Auditoría de cada intento en `auditLog`.
4. Reglas de Firestore y Storage publicadas (`firestore.rules`, `storage.rules`).
5. Headers de seguridad (CSP, HSTS, X-Frame-Options, etc.) configurados en
   `firebase.json` y `apps/web/next.config.ts`.
6. Retención de `auditLog` (90 días) configurada como Cloud Function
   programada (`cleanupAuditLog`).

## Configuración actual (procedimiento)

### Rotar la contraseña de admin

```bash
# 1. Generar un nuevo hash localmente (no commitear la salida).
node scripts/generate-hash.mjs

# 2. Subir el hash como secret de Cloud Functions.
firebase functions:secrets:set ADMIN_PASSWORD_HASH

# 3. Re-desplegar para que la función tome el nuevo valor.
firebase deploy --only functions:adminLogin
```

### Rotar API keys

- **Firebase Web config**: Firebase Console -> Configuración del proyecto ->
  Tus aplicaciones -> regenerar o crear nueva app web.
- **EmailJS**: dashboard.emailjs.com -> Account -> regenerar Public Key.

Los valores nuevos NO van al repo. Se inyectan vía variables de entorno
(`apps/web/.env.example` documenta los nombres esperados) o mediante el
template `firebase-config.template.js` para el front estático legado.

## Antes de cada commit

```bash
git status
# Asegurate de que firebase-config.js, .env*, *.key y *.pem NO aparezcan.
```

El `.gitignore` ya cubre estos patrones; verificalo si en algún momento se
edita ese archivo.

## Estado

- Credenciales antiguas: rotadas, sin valor.
- Historial de git: limpio.
- Acceso admin: requiere hash bcrypt + custom token de Firebase Auth.
- Auditoría: activa y con retención automática.

Última actualización: 2026-05.
