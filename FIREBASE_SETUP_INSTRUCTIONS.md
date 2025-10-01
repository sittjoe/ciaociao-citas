# 🔥 Instrucciones para Configurar Firebase Security Rules

## ⚠️ PROBLEMA ACTUAL
Error: **"Missing or insufficient permissions"** al intentar agregar horarios desde el panel de administración.

## ✅ SOLUCIÓN: Desplegar las reglas de seguridad

Tienes **2 opciones** para desplegar las reglas:

---

## 📱 OPCIÓN 1: Firebase Console (MÁS FÁCIL - 5 minutos)

### Paso 1: Configurar Firestore Rules
1. Ve a: https://console.firebase.google.com/
2. Selecciona tu proyecto: **ciaociao-citas**
3. En el menú izquierdo, haz clic en **"Firestore Database"**
4. Haz clic en la pestaña **"Rules"** (Reglas)
5. **Copia y pega** el contenido del archivo `firestore.rules` (está en este proyecto)
6. Haz clic en **"Publish"** (Publicar)

### Paso 2: Configurar Storage Rules
1. En el menú izquierdo, haz clic en **"Storage"**
2. Haz clic en la pestaña **"Rules"** (Reglas)
3. **Copia y pega** el contenido del archivo `storage.rules` (está en este proyecto)
4. Haz clic en **"Publish"** (Publicar)

### ✅ ¡Listo! Ahora deberías poder:
- ✅ Agregar horarios desde el panel de administración
- ✅ Editar y eliminar citas
- ✅ Clientes pueden ver horarios y agendar citas
- ✅ Subir identificaciones sin errores

---

## 💻 OPCIÓN 2: Firebase CLI (Para desarrolladores)

### Paso 1: Instalar Firebase CLI
```bash
npm install -g firebase-tools
```

Si tienes problemas de permisos, usa:
```bash
sudo npm install -g firebase-tools
```

### Paso 2: Login a Firebase
```bash
firebase login
```

### Paso 3: Inicializar el proyecto
```bash
cd "/Users/joesittm/Desktop/agendador de citas ciao ciao"
firebase init
```

Selecciona:
- ✅ Firestore
- ✅ Storage
- Usa los archivos existentes: `firestore.rules`, `storage.rules`

### Paso 4: Desplegar las reglas
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

### ✅ ¡Listo!

---

## 📋 ¿QUÉ HACEN ESTAS REGLAS?

### Firestore Rules (Base de datos)
- **Slots (horarios):**
  - ✅ Clientes: pueden ver solo horarios disponibles
  - ✅ Admin: puede crear, editar y eliminar cualquier horario

- **Appointments (citas):**
  - ✅ Clientes: pueden crear citas (status: 'pending')
  - ✅ Admin: puede leer, actualizar status, y eliminar citas

### Storage Rules (Archivos)
- **Identifications (identificaciones):**
  - ✅ Clientes: pueden subir archivos (hasta 5MB)
  - ✅ Admin: puede ver todas las identificaciones
  - ✅ Solo permite imágenes y PDFs

---

## 🧪 CÓMO PROBAR QUE FUNCIONÓ

### Desde el Admin Panel:
1. Ve a: https://citas.ciaociao.mx/admin.html
2. Login con contraseña: `27181730`
3. Ve a la pestaña **"Horarios"**
4. Intenta agregar un nuevo horario
5. ✅ **Debería funcionar sin errores**

### Desde el Cliente:
1. Ve a: https://citas.ciaociao.mx/
2. Deberías ver el calendario con días marcados (dots dorados)
3. Selecciona una fecha y hora
4. Completa el formulario
5. ✅ **Debería enviarse sin errores**

---

## ❓ PREGUNTAS FRECUENTES

### ¿Por qué necesito reglas de seguridad?
Firebase usa un modelo de **"deny by default"** (denegar por defecto). Sin reglas, TODO está bloqueado.

### ¿Son seguras estas reglas?
✅ Sí. Las reglas:
- Validan el formato de los datos
- Limitan el tamaño de archivos (5MB)
- Permiten operaciones específicas según el rol
- Previenen spam y abuso

### ¿Necesito autenticación de usuarios?
No. Este sistema funciona sin login para clientes. Solo el admin panel tiene contraseña.

### ¿Qué pasa si alguien abusa del sistema?
Puedes agregar rate limiting en Firebase Console:
1. Ve a Firestore → Settings
2. Activa **"App Check"** para prevenir bots

---

## 🆘 AYUDA

Si tienes problemas:
1. Verifica que publicaste ambas reglas (Firestore + Storage)
2. Espera 1-2 minutos después de publicar (propagación)
3. Recarga la página del admin panel (Ctrl+Shift+R)
4. Revisa la consola del navegador (F12) para ver errores específicos

---

## 📧 SOPORTE

- Firebase Console: https://console.firebase.google.com/
- Documentación: https://firebase.google.com/docs/firestore/security/get-started
- Proyecto ID: **ciaociao-citas**
