# Ciao Ciao Joyería — Verificación de Invitados

## Por qué existe esta feature

El showroom privado requiere identificación de cada persona que ingresa — no solo del titular de la cita. El titular declara a sus invitados al momento de reservar; cada invitado recibe un email con un link único donde sube su propia identificación antes de la visita. Los invitados que no completen la verificación no pueden ingresar.

---

## Flujo del titular (booking)

### Paso "Datos" (`BookingWizard` → step `'form'`)

El componente `<GuestsField>` aparece al final del formulario de datos. El titular puede agregar de 0 a 3 invitados, ingresando nombre y email por cada uno.

Validaciones en cliente:
- Nombre: 2–100 caracteres, solo letras y caracteres comunes (`guestInputSchema` en `src/lib/schemas.ts`).
- Email: válido, único entre invitados, diferente al email del titular.
- Duplicados bloqueados inline al hacer blur en el campo email.

**Archivos:** `src/components/booking/GuestsField.tsx`, `src/lib/schemas.ts`

### Paso "Confirmar" (`BookingWizard` → step `'review'`)

Antes del botón "Enviar solicitud" aparecen dos bloques condicionales:

| Condición | Bloque |
|---|---|
| Menos de 3 invitados | Bloque neutro re-preguntando si desea agregar (más) invitados. Botón regresa al paso Datos. |
| Al menos 1 invitado | Bloque ámbar: *"Los invitados que no completen la verificación no podrán ingresar al showroom."* |

**Archivo:** `src/components/booking/BookingWizard.tsx` (líneas ~410–436)

### Al confirmar

`POST /api/booking` crea los subdocs de guests en la misma transacción Firestore que crea la cita. Después del response, `after()` dispara el email de invitación a cada guest.

**Archivo:** `src/app/api/booking/route.ts`

---

## Flujo del invitado (auto-verificación)

1. Recibe email con link único: `https://citas.ciaociao.mx/invitado/{verifyToken}`
2. La página `/invitado/[token]` detecta el estado del guest y muestra la UI correspondiente:

| Estado | Pantalla |
|---|---|
| `pending` | Formulario de subida de ID |
| `verified` | Confirmación — ya verificado |
| `expired` | Aviso — el plazo venció |
| `excluded` | Aviso — fue excluido por el admin |
| Token inválido | Error 404 |

3. Sube su identificación (JPG / PNG / WebP / PDF, máx 5 MB) usando el mismo `<IDUploader>` del titular.
4. `POST /api/guests/[token]` valida el archivo, lo sube a Firebase Storage bajo `identifications/guest_{guestId}_{uuid}.{ext}`, marca `status: 'verified'` y recomputa `appointment.guestsAllVerified`.

**Archivos:** `src/app/invitado/[token]/page.tsx`, `src/app/api/guests/[token]/route.ts`, `src/lib/guests.ts` (`recomputeGuestsAllVerified`)

---

## Flujo del admin

### Vista en tabla

La columna de invitados muestra el contador `guestCount`. Al abrir el modal de detalle aparece `<GuestsList>`.

### GuestsList

Lista cada invitado con:
- **Dot animado** de estado: ámbar con ping (`pending`), verde (`verified`), rojo (`expired`), gris (`excluded`).
- **Badge** de estado con label en español.
- **Link "Ver ID"** → abre URL firmada de 15 min generada por `GET /api/admin/id-url?path=...`.
- **Botón verificar** (shield) — disponible en `pending` y `expired`. Admin acepta manualmente sin requerir email del invitado.
- **Botón excluir** (user-x) — disponible en cualquier estado salvo `excluded` y `verified`.

**Archivos:** `src/components/admin/GuestsList.tsx`, `src/app/api/admin/appointments/[id]/guests/route.ts`, `src/app/api/admin/appointments/[id]/guests/[guestId]/route.ts`, `src/app/api/admin/id-url/route.ts`

---

## Modelo de datos

### Subcolección `appointments/{apptId}/guests/{guestId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | `string` | Nombre del invitado |
| `email` | `string` | Email del invitado |
| `status` | `'pending' \| 'verified' \| 'expired' \| 'excluded'` | Estado de verificación |
| `verifyToken` | `string` | UUID único para el link de auto-verificación |
| `identificationUrl` | `string \| null` | Path en Firebase Storage |
| `invitedAt` | `Timestamp` | Cuando se creó la cita |
| `verifiedAt` | `Timestamp \| null` | Cuando completó la verificación |
| `expiredAt` | `Timestamp \| null` | Cuando expiró (seteado por cron) |
| `excludedAt` | `Timestamp \| null` | Cuando fue excluido por admin |
| `excludedBy` | `string \| null` | UID del admin que excluyó |
| `reminder48Sent` | `boolean` | Recordatorio 48h enviado |
| `reminder24Sent` | `boolean` | Recordatorio 24h enviado |

### Campos derivados en `appointments/{apptId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `guestCount` | `number` | Cantidad de invitados declarados |
| `guestsAllVerified` | `boolean` | `true` cuando todos los guests tienen `status: 'verified'` |

**Tipos:** `src/types/index.ts` (`Guest`, `GuestStatus`)

---

## Recordatorios y expiración (cron)

`GET /api/reminders` — llamado por Vercel cron diariamente a las 8am CST (`vercel.json`: `"0 14 * * *"`). Autenticado con `Authorization: Bearer {CRON_SECRET}`.

Para guests `pending`:
- **48h antes** de la cita: envía recordatorio de verificación, marca `reminder48Sent: true`.
- **24h antes** de la cita: envía último recordatorio, marca `reminder24Sent: true`.
- Guests que llegan a la hora de la cita sin verificar: `expirePendingGuests()` los marca `status: 'expired'`.

**Archivos:** `src/app/api/reminders/route.ts`, `src/lib/guests.ts` (`expirePendingGuests`), `src/lib/email.ts` (`sendGuestReminder`)

---

## Validaciones server-side

`POST /api/guests/[token]` aplica la misma triple validación que el ID del titular:

1. Archivo presente.
2. Tamaño ≤ 5 MB (`MAX_FILE_BYTES = 5 * 1024 * 1024`).
3. MIME en `ALLOWED_MIME`: `['image/jpeg', 'image/png', 'image/webp', 'application/pdf']`.

Fallo en cualquiera → `422 Unprocessable Entity`.

El token de invitado es consultado via `collectionGroup('guests').where('verifyToken', '==', token)` — no expone el `appointmentId` en la URL.
