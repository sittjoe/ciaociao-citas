# 🚨 ACCIONES DE SEGURIDAD URGENTES

**Fecha:** 2025-10-06
**Estado:** ⚠️ CREDENCIALES EXPUESTAS - ACCIÓN REQUERIDA

---

## ❗ PROBLEMA DETECTADO

Tu archivo `firebase-config.js` con **credenciales reales** estuvo expuesto en GitHub desde el commit `dd7ef06` (varios días).

**Credenciales que estuvieron expuestas:**
- 🔓 Firebase API Key: `AIzaSyBxNIfANjQhnHtzr0SMYwMXwvMizpJo-p0`
- 🔓 EmailJS Public Key: `AyFUquhb1yytve6Lv`
- 🔓 Contraseña Admin: `27181730`
- 🔓 Email Admin: `info@ciaociao.mx`

---

## ✅ CORRECCIONES YA APLICADAS

1. ✅ `.gitignore` corregido para ignorar `firebase-config.js`
2. ✅ `firebase-config.js` removido del **historial completo** de Git (25 commits)
3. ✅ Force push aplicado - GitHub ya tiene el historial limpio
4. ✅ Migración a Firebase Hosting (eliminados Vercel/Netlify)
5. ✅ Documentación actualizada (README, SETUP, MANUAL)

---

## 🔴 ACCIONES QUE DEBES TOMAR AHORA (CRÍTICO)

### 1️⃣ REGENERAR FIREBASE API KEYS

**¿Por qué?** Tu API key estuvo pública. Aunque Firebase tiene reglas de seguridad, es mejor regenerarla.

**Pasos:**

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Abre tu proyecto **"ciaociao-citas"**
3. Click en ⚙️ **Configuración del proyecto** → **General**
4. Baja hasta **"Tus aplicaciones"**
5. Encuentra tu app web (</> Web)
6. **Opción A - Crear nueva app:**
   - Click en "Agregar app" → Selecciona Web (</>)
   - Nombre: "Ciao Ciao Booking v2"
   - Marca "Firebase Hosting"
   - Copia las **nuevas credenciales**
   - Elimina la app antigua (opcional pero recomendado)

7. **Opción B - Usar la existente:**
   - Si no puedes eliminar, simplemente copia las credenciales actuales
   - Firebase tiene reglas de seguridad que protegen los datos

8. **Actualiza** `firebase-config.js` local con las nuevas credenciales:
   ```javascript
   export const firebaseConfig = {
       apiKey: "TU-NUEVA-API-KEY",
       authDomain: "ciaociao-citas.firebaseapp.com",
       projectId: "ciaociao-citas",
       storageBucket: "ciaociao-citas.firebasestorage.app",
       messagingSenderId: "TU-NUEVO-SENDER-ID",
       appId: "TU-NUEVO-APP-ID"
   };
   ```

---

### 2️⃣ REGENERAR EMAILJS PUBLIC KEY

**¿Por qué?** Tu public key también estuvo expuesta.

**Pasos:**

1. Ve a [EmailJS Dashboard](https://dashboard.emailjs.com/)
2. Login con tu cuenta
3. Ve a **Account** → **General**
4. Si hay opción de regenerar el **Public Key**, hazlo
5. Si no, verifica que el **Service ID** y **Template ID** estén activos
6. Actualiza `firebase-config.js`:
   ```javascript
   export const emailConfig = {
       publicKey: "TU-NUEVO-PUBLIC-KEY",
       serviceId: "service_swd9ilc",
       templateId: "template_hsqbxmy"
   };
   ```

---

### 3️⃣ CAMBIAR CONTRASEÑA DE ADMIN

**¿Por qué?** La contraseña `27181730` estuvo pública.

**Pasos:**

1. Edita `firebase-config.js`:
   ```javascript
   export const ADMIN_PASSWORD = "UNA-CONTRASENA-MUY-SEGURA-NUEVA";
   ```

2. Usa una contraseña fuerte (mínimo 12 caracteres, letras, números, símbolos)

---

### 4️⃣ VERIFICAR REGLAS DE SEGURIDAD FIREBASE

**Firestore Rules** - Ya configuradas en `firestore.rules`:
```javascript
// ✅ Clientes solo pueden CREAR citas (no leer ni modificar)
// ✅ Admin puede hacer todo
```

**Storage Rules** - Ya configuradas en `storage.rules`:
```javascript
// ✅ Solo uploads de imágenes/PDF < 5MB
// ✅ Lectura solo para archivos de identificación
```

**Verifica que estén desplegadas:**
```bash
firebase deploy --only firestore:rules,storage
```

---

### 5️⃣ MONITOREAR ACTIVIDAD EN FIREBASE

**Revisa si hay actividad sospechosa:**

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Abre **Firestore Database** → Pestaña **"Data"**
   - Verifica que no haya documentos extraños
   - Revisa las citas recientes

3. Abre **Storage** → Pestaña **"Files"**
   - Revisa los archivos subidos
   - Verifica que solo haya identificaciones legítimas

4. Abre **Authentication** (si la usas en el futuro)
   - Revisa usuarios registrados

---

## 📋 CHECKLIST COMPLETO

Marca cuando completes cada acción:

- [ ] **Firebase API Key regenerada** y actualizada en `firebase-config.js`
- [ ] **EmailJS Public Key verificada/regenerada** y actualizada
- [ ] **Contraseña de admin cambiada** a una nueva y segura
- [ ] **Archivo `firebase-config.js` actualizado localmente**
- [ ] **Verificadas reglas de seguridad** en Firebase Console
- [ ] **Revisada actividad en Firestore** (no hay datos sospechosos)
- [ ] **Revisada actividad en Storage** (solo archivos legítimos)
- [ ] **Desplegado en Firebase Hosting**: `firebase deploy`
- [ ] **Probado el sitio** en `https://ciaociao-citas.web.app`
- [ ] **Probado el admin** en `https://ciaociao-citas.web.app/admin.html`

---

## 🚀 DESPLEGAR EN FIREBASE HOSTING

Una vez actualizadas las credenciales:

```bash
# 1. Asegúrate de tener firebase-tools instalado
npm install -g firebase-tools

# 2. Login en Firebase
firebase login

# 3. Verificar que estás en el proyecto correcto
firebase projects:list

# 4. Desplegar todo (hosting + rules)
firebase deploy

# 5. Tu sitio estará disponible en:
# https://ciaociao-citas.web.app
# https://ciaociao-citas.firebaseapp.com
```

---

## ⚠️ IMPORTANTE: NO SUBIR firebase-config.js

**El archivo `firebase-config.js` está ahora protegido:**

- ✅ Incluido en `.gitignore` (línea 2)
- ✅ Removido del historial de Git (25 commits reescritos)
- ✅ GitHub ya no tiene acceso a este archivo
- ✅ Template disponible: `firebase-config.template.js`

**Antes de cada commit, verifica:**
```bash
git status
# Asegúrate que firebase-config.js NO aparezca en la lista
```

---

## 📞 SOPORTE

Si tienes problemas:

1. 📖 Lee `SETUP.md` para guía completa
2. 📖 Lee `MANUAL-USUARIO.md` para uso del panel admin
3. 🔥 Consulta [Firebase Docs](https://firebase.google.com/docs)
4. 📧 Consulta [EmailJS Docs](https://www.emailjs.com/docs/)

---

## ✅ ESTADO ACTUAL DEL PROYECTO

**Repositorio GitHub:**
- ✅ Historial limpio (sin credenciales)
- ✅ `.gitignore` corregido
- ✅ Solo Firebase Hosting (Vercel/Netlify removidos)
- ✅ Documentación actualizada

**Próximo paso:**
1. Regenerar credenciales (ver arriba)
2. Actualizar `firebase-config.js` localmente
3. Desplegar: `firebase deploy`

---

**Generado:** 2025-10-06
**Urgencia:** 🔴 ALTA - Toma acción hoy mismo
