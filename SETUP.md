# 🔧 Guía de Configuración - Sistema de Citas Ciao Ciao

Esta guía te llevará paso a paso por la configuración completa del sistema de citas para tu joyería.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener:

1. ✅ Una cuenta de correo electrónico (Gmail recomendado)
2. ✅ Acceso a internet
3. ✅ Un navegador web moderno (Chrome, Firefox, Safari, Edge)

---

## 🔥 Paso 1: Configurar Firebase

### 1.1 Crear Proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en **"Agregar proyecto"** o **"Create a project"**
3. Ingresa el nombre: `ciaociao-citas` (o el que prefieras)
4. Desactiva Google Analytics (no es necesario para este proyecto)
5. Haz clic en **"Crear proyecto"**

### 1.2 Registrar Aplicación Web

1. En el dashboard de tu proyecto, haz clic en el ícono **</>** (Web)
2. Ingresa el nombre de la app: `Ciao Ciao Booking`
3. **NO** marques "Firebase Hosting"
4. Haz clic en **"Registrar app"**
5. **¡IMPORTANTE!** Copia todo el código de configuración que aparece:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcd1234"
};
```

**Guarda esta información**, la necesitarás más adelante.

### 1.3 Activar Firestore Database

1. En el menú lateral, ve a **"Firestore Database"**
2. Haz clic en **"Crear base de datos"** o **"Create database"**
3. Selecciona **"Comenzar en modo de prueba"** (Start in test mode)
4. Elige la ubicación: **us-central1** (o la más cercana a ti)
5. Haz clic en **"Habilitar"** o **"Enable"**

### 1.4 Configurar Reglas de Seguridad de Firestore

1. En Firestore, ve a la pestaña **"Reglas"** (Rules)
2. Reemplaza las reglas por defecto con las siguientes:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir lectura de slots a todos
    match /slots/{slotId} {
      allow read: if true;
      allow write: if false; // Solo admin desde consola o funciones
    }

    // Permitir lectura/escritura de appointments
    match /appointments/{appointmentId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if false;
    }
  }
}
```

3. Haz clic en **"Publicar"** (Publish)

### 1.5 Activar Storage

1. En el menú lateral, ve a **"Storage"**
2. Haz clic en **"Comenzar"** o **"Get started"**
3. Selecciona **"Comenzar en modo de prueba"**
4. Elige la misma ubicación que Firestore
5. Haz clic en **"Listo"** o **"Done"**

### 1.6 Configurar Reglas de Seguridad de Storage

1. En Storage, ve a la pestaña **"Reglas"** (Rules)
2. Reemplaza las reglas por defecto con las siguientes:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /identifications/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 5 * 1024 * 1024 // 5MB máx
                   && request.resource.contentType.matches('image/.*|application/pdf');
    }
  }
}
```

3. Haz clic en **"Publicar"** (Publish)

---

## 📧 Paso 2: Configurar EmailJS

### 2.1 Crear Cuenta en EmailJS

1. Ve a [EmailJS](https://www.emailjs.com/)
2. Haz clic en **"Sign Up"**
3. Registra tu cuenta (usa tu Gmail)
4. Verifica tu correo electrónico

### 2.2 Conectar tu Servicio de Email

1. En el dashboard de EmailJS, ve a **"Email Services"**
2. Haz clic en **"Add New Service"**
3. Selecciona **"Gmail"** (recomendado)
4. Haz clic en **"Connect Account"**
5. Autoriza EmailJS a enviar emails desde tu cuenta Gmail
6. Ingresa un nombre para el servicio: `ciaociao_service`
7. Haz clic en **"Create Service"**
8. **¡IMPORTANTE!** Copia el **Service ID** (ejemplo: `service_abc123`)

### 2.3 Crear Template de Email

1. Ve a **"Email Templates"**
2. Haz clic en **"Create New Template"**
3. Configura el template así:

**Subject (Asunto):**
```
{{subject}}
```

**Content (Contenido):**
```
Hola {{to_name}},

{{message}}

---
Ciao Ciao Joyería
Tu destino de lujo y elegancia
```

**Settings:**
- **To Email:** `{{to_email}}`
- **From Name:** `Ciao Ciao Joyería`
- **From Email:** (tu email configurado)
- **Reply To:** (tu email configurado)

4. Haz clic en **"Save"**
5. **¡IMPORTANTE!** Copia el **Template ID** (ejemplo: `template_xyz789`)

### 2.4 Obtener tu Public Key

1. Ve a **"Account"** en el menú superior derecho
2. Ve a la sección **"API Keys"**
3. **¡IMPORTANTE!** Copia tu **Public Key** (ejemplo: `UkP-XYZ123_ABCD`)

---

## 📝 Paso 3: Configurar el Archivo `firebase-config.js`

Ahora que tienes toda la información, es momento de configurar el archivo.

### 3.1 Crear el Archivo

1. Abre tu editor de código (VS Code, Sublime, etc.)
2. En la carpeta raíz de tu proyecto, crea un archivo llamado: `firebase-config.js`

### 3.2 Contenido del Archivo

Copia y pega el siguiente código, **reemplazando** los valores con los que copiaste:

```javascript
// ============================================
// CONFIGURACIÓN DE FIREBASE
// ============================================

export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_FIREBASE_API_KEY",
  authDomain: "PEGA_AQUI_TU_AUTH_DOMAIN",
  projectId: "PEGA_AQUI_TU_PROJECT_ID",
  storageBucket: "PEGA_AQUI_TU_STORAGE_BUCKET",
  messagingSenderId: "PEGA_AQUI_TU_MESSAGING_SENDER_ID",
  appId: "PEGA_AQUI_TU_APP_ID"
};

// ============================================
// CONTRASEÑA DEL PANEL DE ADMINISTRACIÓN
// ============================================

// ⚠️ IMPORTANTE: Cambia esta contraseña por una segura
// Esta es la contraseña para acceder al panel de administración
export const ADMIN_PASSWORD = "CiaoCiao2025";

// ============================================
// CONFIGURACIÓN DE EMAILJS
// ============================================

export const emailConfig = {
  publicKey: "PEGA_AQUI_TU_EMAILJS_PUBLIC_KEY",
  serviceId: "PEGA_AQUI_TU_EMAILJS_SERVICE_ID",
  templateId: "PEGA_AQUI_TU_EMAILJS_TEMPLATE_ID"
};
```

### 3.3 Ejemplo de Configuración Completa

Así debería verse tu archivo una vez completado:

```javascript
export const firebaseConfig = {
  apiKey: "AIzaSyC1234567890abcdefghijklmnop",
  authDomain: "ciaociao-citas.firebaseapp.com",
  projectId: "ciaociao-citas",
  storageBucket: "ciaociao-citas.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};

export const ADMIN_PASSWORD = "MiContraseñaSegura2025!";

export const emailConfig = {
  publicKey: "UkP-XYZ123_ABCD",
  serviceId: "service_abc123",
  templateId: "template_xyz789"
};
```

### 3.4 ⚠️ Seguridad Importante

- ✅ **NUNCA** compartas este archivo en repositorios públicos
- ✅ Cambia `ADMIN_PASSWORD` por una contraseña fuerte
- ✅ Si usas Git, agrega `firebase-config.js` al archivo `.gitignore`

---

## 🚀 Paso 4: Desplegar en Vercel o Netlify

### Opción A: Vercel

1. Ve a [Vercel](https://vercel.com/)
2. Haz clic en **"Sign Up"** (si no tienes cuenta)
3. Conecta tu cuenta de GitHub
4. Haz clic en **"Add New Project"**
5. Importa tu repositorio de GitHub
6. Vercel detectará automáticamente la configuración (gracias a `vercel.json`)
7. Haz clic en **"Deploy"**
8. ¡Listo! Tu sitio estará en: `https://tu-proyecto.vercel.app`

### Opción B: Netlify

1. Ve a [Netlify](https://www.netlify.com/)
2. Haz clic en **"Sign Up"** (si no tienes cuenta)
3. Conecta tu cuenta de GitHub
4. Haz clic en **"Add new site"** → **"Import an existing project"**
5. Selecciona tu repositorio de GitHub
6. Netlify detectará automáticamente la configuración (gracias a `netlify.toml`)
7. Haz clic en **"Deploy site"**
8. ¡Listo! Tu sitio estará en: `https://tu-proyecto.netlify.app`

---

## ✅ Paso 5: Verificar que Todo Funcione

### 5.1 Probar el Frontend de Clientes

1. Abre tu sitio: `https://tu-proyecto.vercel.app` (o Netlify)
2. Verifica que la página cargue correctamente
3. Intenta agendar una cita de prueba:
   - Selecciona una fecha (necesitas agregar horarios primero desde el admin)
   - Completa el formulario
   - Sube una identificación de prueba
   - Confirma la cita

### 5.2 Probar el Panel de Administración

1. Ve a: `https://tu-proyecto.vercel.app/admin.html`
2. Ingresa la contraseña que configuraste en `ADMIN_PASSWORD`
3. Verifica que puedas:
   - Ver el dashboard con estadísticas
   - Agregar horarios disponibles
   - Ver citas pendientes
   - Aceptar/rechazar citas
   - Exportar a CSV

### 5.3 Verificar Emails

1. Agenda una cita de prueba con tu propio email
2. Verifica que te llegue el email de confirmación
3. Acepta o rechaza la cita desde el admin
4. Verifica que llegue el email de aceptación/rechazo

---

## 🐛 Solución de Problemas Comunes

### Problema: No aparecen horarios disponibles

**Solución:** Primero debes agregar horarios desde el panel de administración.

### Problema: No se envían los emails

**Soluciones:**
1. Verifica que el `publicKey`, `serviceId` y `templateId` de EmailJS sean correctos
2. Revisa la consola del navegador (F12) para ver errores
3. Verifica que tu cuenta de EmailJS esté verificada
4. Revisa la cuota de emails (EmailJS gratis: 200 emails/mes)

### Problema: Error al subir identificaciones

**Soluciones:**
1. Verifica que las reglas de Storage estén configuradas correctamente
2. Asegúrate de que el archivo sea menor a 5MB
3. Verifica que sea una imagen (JPG, PNG) o PDF

### Problema: No puedo acceder al admin

**Soluciones:**
1. Verifica que la contraseña en `firebase-config.js` sea correcta
2. Limpia el cache del navegador (Ctrl+Shift+Delete)
3. Intenta en modo incógnito

---

## 📞 Soporte Adicional

Si tienes problemas que no puedes resolver:

1. 🔍 Revisa la consola del navegador (F12 → Console)
2. 📧 Revisa los logs de Firebase Console
3. 📊 Verifica los logs de Vercel o Netlify
4. 📚 Consulta el archivo `MANUAL-USUARIO.md` para instrucciones de uso

---

## ✨ ¡Felicidades!

Tu sistema de citas está completamente configurado y listo para usar. 🎉

**URLs Importantes:**
- 🌐 Sitio principal: `https://tu-proyecto.vercel.app`
- 🔐 Panel admin: `https://tu-proyecto.vercel.app/admin.html`
- 🔥 Firebase Console: https://console.firebase.google.com/
- 📧 EmailJS Dashboard: https://dashboard.emailjs.com/

---

**Hecho con 💎 para Ciao Ciao Joyería**
