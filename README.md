# 🌟 Sistema de Citas - Ciao Ciao Joyería

[![Firebase](https://img.shields.io/badge/Firebase-10.8.0-FFCA28?logo=firebase)](https://firebase.google.com/)
[![EmailJS](https://img.shields.io/badge/EmailJS-3.x-0066CC?logo=minutemailer)](https://www.emailjs.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](https://vercel.com/)
[![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify)](https://www.netlify.com/)

Sistema completo de agendamiento de citas para showroom de joyería, con diseño luxury y gestión avanzada.

## 📋 Características

### Para Clientes:
- ✅ Ver horarios disponibles en calendario visual
- ✅ Formulario de solicitud con datos personales
- ✅ Subida de identificación (foto/PDF)
- ✅ Confirmación automática por email
- ✅ Diseño responsive y elegante

### Para Administrador:
- ✅ Panel de administración protegido con contraseña
- ✅ Dashboard con estadísticas en tiempo real
- ✅ Gestión de horarios disponibles (agregar/eliminar)
- ✅ Filtros avanzados (búsqueda, fechas, estado)
- ✅ Acciones en lote (aceptar/rechazar múltiples)
- ✅ Aceptar o rechazar citas individuales
- ✅ Ver identificaciones adjuntas en modal
- ✅ Exportación a CSV (pendientes, confirmadas, todas)
- ✅ Notificaciones toast elegantes
- ✅ Historial completo de citas
- ✅ Emails automáticos (confirmación/rechazo)

## 🚀 Configuración

### 1. Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto llamado "ciaociao-appointments" (o el nombre que prefieras)
3. Habilita **Firestore Database**:
   - Ve a "Build" → "Firestore Database"
   - Click en "Create database"
   - Selecciona modo "production"
   - Elige la ubicación más cercana

4. Configura las **reglas de seguridad** de Firestore:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Slots - todos pueden leer, nadie puede escribir (solo admin via panel)
       match /slots/{slotId} {
         allow read: if true;
         allow write: if false;
       }

       // Appointments - todos pueden crear, nadie puede leer/modificar (solo admin via panel)
       match /appointments/{appointmentId} {
         allow create: if true;
         allow read, update, delete: if false;
       }
     }
   }
   ```

5. Habilita **Storage**:
   - Ve a "Build" → "Storage"
   - Click en "Get started"
   - Usa las reglas por defecto

6. Configura las **reglas de seguridad** de Storage:
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /identifications/{fileName} {
         allow read: if false;
         allow write: if request.resource.size < 5 * 1024 * 1024
                     && request.resource.contentType.matches('image/.*|application/pdf');
       }
     }
   }
   ```

7. Obtén la configuración de tu proyecto:
   - Ve a configuración del proyecto (ícono de engranaje)
   - En "Tus aplicaciones" → "Web", registra una app web
   - Copia el objeto `firebaseConfig`

8. Pega la configuración en `firebase-config.js`:
   ```javascript
   export const firebaseConfig = {
       apiKey: "tu-api-key",
       authDomain: "tu-proyecto.firebaseapp.com",
       projectId: "tu-proyecto-id",
       storageBucket: "tu-proyecto.appspot.com",
       messagingSenderId: "tu-sender-id",
       appId: "tu-app-id"
   };
   ```

### 2. Configurar EmailJS

1. Ve a [EmailJS](https://www.emailjs.com/)
2. Crea una cuenta gratuita
3. Agrega un servicio de email:
   - Ve a "Email Services"
   - Conecta tu email (Gmail, Outlook, etc.)
   - Copia el **Service ID**

4. Crea una plantilla de email:
   - Ve a "Email Templates"
   - Click en "Create New Template"
   - Usa estas variables en el template:
     - `{{to_email}}` - Email del destinatario
     - `{{to_name}}` - Nombre del destinatario
     - `{{subject}}` - Asunto del email
     - `{{message}}` - Contenido del mensaje
   - Copia el **Template ID**

5. Obtén tu Public Key:
   - Ve a "Account" → "General"
   - Copia el **Public Key**

6. Pega la configuración en `firebase-config.js`:
   ```javascript
   export const emailConfig = {
       serviceId: "tu_service_id",
       templateId: "tu_template_id",
       publicKey: "tu_public_key"
   };
   ```

7. **IMPORTANTE**: Configura el email del administrador en `firebase-config.js`:
   ```javascript
   export const adminEmail = "tu-email@ejemplo.com";
   ```
   Aquí recibirás notificaciones cuando un cliente agende una cita.

### 3. Cambiar Contraseña de Admin

En `firebase-config.js`, cambia la contraseña:
```javascript
export const ADMIN_PASSWORD = "tu-contraseña-segura-aqui";
```

### 4. Agregar EmailJS al HTML

Agrega este script en `index.html` y `admin.html` antes del cierre de `</body>`:
```html
<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
```

## 📦 Despliegue

### Opción 1: Vercel (Recomendado)

1. Ve a [Vercel](https://vercel.com/)
2. Click en **"New Project"**
3. Importa tu repositorio de GitHub
4. Vercel detectará automáticamente la configuración (gracias a `vercel.json`)
5. Click en **"Deploy"**
6. Tu sitio estará en: `https://tu-proyecto.vercel.app`

**URLs importantes:**
- Cliente: `https://tu-proyecto.vercel.app/`
- Admin: `https://tu-proyecto.vercel.app/admin.html`

### Opción 2: Netlify

1. Ve a [Netlify](https://www.netlify.com/)
2. Click en **"Add new site"** → **"Import an existing project"**
3. Conecta tu repositorio de GitHub
4. Netlify detectará automáticamente la configuración (gracias a `netlify.toml`)
5. Click en **"Deploy site"**
6. Tu sitio estará en: `https://tu-proyecto.netlify.app`

**URLs importantes:**
- Cliente: `https://tu-proyecto.netlify.app/`
- Admin: `https://tu-proyecto.netlify.app/admin.html`

### ⚠️ Importante después del despliegue

1. **Configura firebase-config.js** con tus credenciales reales
2. **NO subas firebase-config.js** a GitHub (ya está en .gitignore)
3. **Vuelve a desplegar** después de configurar

## 🎯 Uso

### Para Administrador:

1. Ve a `https://tu-proyecto.vercel.app/admin.html` (o tu URL de Netlify)
2. Ingresa la contraseña configurada
3. **Dashboard**:
   - Ve estadísticas en tiempo real
   - Próximas 5 citas confirmadas
   - Acciones rápidas
4. **Agregar horarios**:
   - Pestaña "Horarios"
   - Selecciona fecha y hora
   - Click en "Agregar Horario"
5. **Gestionar citas pendientes**:
   - Pestaña "Pendientes"
   - Usa filtros para buscar
   - Aceptar/rechazar individual o en lote
   - Ver identificación adjunta
6. **Ver historial**:
   - Pestaña "Confirmadas"
   - Filtrar por estado y fechas
   - Exportar a CSV

### Para Clientes:

1. Ve a `https://tu-proyecto.vercel.app/` (o tu URL de Netlify)
2. Selecciona una fecha en el calendario
3. Elige un horario disponible
4. Completa el formulario multi-paso
5. Sube tu identificación (drag & drop)
6. Confirma y envía
7. Recibirás email de confirmación automático

## 🔧 Estructura del Proyecto

```
ciaociao-citas/
├── index.html                      # Página principal para clientes
├── admin.html                      # Panel de administración
├── styles.css                      # Estilos luxury completos
├── app.js                          # Lógica del cliente (606 líneas)
├── admin.js                        # Lógica del admin (803 líneas)
├── validation.js                   # Sistema de validaciones (283 líneas)
├── calendar.js                     # Calendario interactivo (343 líneas)
├── firebase-config.js              # Configuración REAL (NO subir)
├── firebase-config.template.js     # Template para repo
├── vercel.json                     # Configuración Vercel
├── netlify.toml                    # Configuración Netlify
├── assets/icons/                   # 8 SVG icons profesionales
├── SETUP.md                        # Guía de configuración completa
├── MANUAL-USUARIO.md               # Manual de administración
└── README.md                       # Este archivo
```

## ⚠️ Seguridad

### ✅ Configuración Segura Incluida

1. **firebase-config.js ya está protegido**:
   - ✅ Archivo incluido en `.gitignore`
   - ✅ NO se subirá a GitHub
   - ✅ Template disponible: `firebase-config.template.js`

2. **Instrucciones para configurar**:
   - Copia `firebase-config.template.js` → `firebase-config.js`
   - Llena con tus credenciales reales
   - El archivo con credenciales NUNCA se subirá a GitHub

3. **Headers de Seguridad** (automáticos):
   - ✅ X-Content-Type-Options: nosniff
   - ✅ X-Frame-Options: DENY
   - ✅ X-XSS-Protection: 1; mode=block
   - ✅ Referrer-Policy: strict-origin-when-cross-origin
   - ✅ Cache-Control optimizado

4. **Reglas de Firebase**:
   - ✅ Firestore: Clientes solo pueden crear citas, no leer ni modificar
   - ✅ Storage: Solo escritura de archivos < 5MB (imágenes/PDF)
   - ✅ Admin accede vía sesión protegida por contraseña

5. **Contraseña de Admin**:
   - ⚠️ Almacenada en cliente (sessionStorage)
   - ✅ Para producción real, considera Firebase Auth
   - ✅ Suficiente para MVP y uso privado

## 🎨 Personalización

### Paleta de Colores Luxury (en `styles.css`):
```css
:root {
    --gold-champagne: #C9A55A;    /* Dorado champagne principal */
    --gold-dark: #A88B49;         /* Dorado oscuro para hover */
    --gold-light: #E8D5A8;        /* Dorado claro para fondos */
    --black-rich: #0D0D0D;        /* Negro rico para textos */
    --black-soft: #1A1A1A;        /* Negro suave para fondos */
}
```

### Tipografía:
- **Títulos**: Cormorant Garamond (serif elegante)
- **Texto**: Inter (sans-serif moderna)

### Iconos:
- 8 SVG custom en `assets/icons/`
- Fácil de personalizar colores y tamaños

### Mensajes y Textos:
- Todos centralizados en JS y HTML
- Busca por palabra clave para personalizar

## 📧 Plantilla de Email Sugerida

**Asunto**: {{subject}}

**Contenido**:
```
Hola {{to_name}},

{{message}}

---
Ciao Ciao Joyería
📍 [Tu Dirección]
📞 [Tu Teléfono]
📧 [Tu Email]
🌐 [Tu Sitio Web]
```

## 🐛 Solución de Problemas

### No se cargan los horarios:
- Verifica que Firebase esté configurado correctamente
- Revisa la consola del navegador (F12) para ver errores
- Verifica las reglas de seguridad de Firestore

### No se envían emails:
- Verifica que EmailJS esté configurado
- Revisa que el Service ID, Template ID y Public Key sean correctos
- Verifica que el servicio de email esté activo en EmailJS

### No se suben las identificaciones:
- Verifica que Storage esté habilitado en Firebase
- Revisa las reglas de seguridad de Storage
- Verifica que el archivo sea menor a 5MB

## 📝 Licencia

Proyecto privado para Ciao Ciao Joyería.

## 💎 Desarrollado para Ciao Ciao

Sistema de citas profesional para showroom de joyería.
