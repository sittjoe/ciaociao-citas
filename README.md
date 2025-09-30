# 🌟 Sistema de Citas - Ciao Ciao Joyería

Sistema completo de agendamiento de citas para showroom de joyería, deployable en GitHub Pages.

## 📋 Características

### Para Clientes:
- ✅ Ver horarios disponibles en calendario visual
- ✅ Formulario de solicitud con datos personales
- ✅ Subida de identificación (foto/PDF)
- ✅ Confirmación automática por email
- ✅ Diseño responsive y elegante

### Para Administrador:
- ✅ Panel de administración protegido con contraseña
- ✅ Gestión de horarios disponibles (agregar/eliminar)
- ✅ Ver citas pendientes de aprobación
- ✅ Aceptar o rechazar citas
- ✅ Ver identificaciones adjuntas
- ✅ Historial de citas confirmadas/rechazadas
- ✅ Notificaciones automáticas por email

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

7. **IMPORTANTE**: Actualiza el email del admin en `app.js` línea 136:
   ```javascript
   to_email: 'tu-email@ciaociao.com', // ← Cambia esto
   ```

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

## 📦 Despliegue en GitHub Pages

### Opción 1: Desde GitHub Web

1. Crea un nuevo repositorio en GitHub
2. Sube todos los archivos del proyecto
3. Ve a Settings → Pages
4. En "Source", selecciona la rama `main` y carpeta `/ (root)`
5. Click en "Save"
6. Tu sitio estará disponible en `https://tu-usuario.github.io/nombre-repo/`

### Opción 2: Desde la Terminal

```bash
# Inicializar repositorio
git init
git add .
git commit -m "Initial commit: Sistema de citas Ciao Ciao"

# Conectar con GitHub
git branch -M main
git remote add origin https://github.com/tu-usuario/nombre-repo.git
git push -u origin main

# Habilitar GitHub Pages desde Settings → Pages
```

## 🎯 Uso

### Para Administrador:

1. Ve a `https://tu-sitio.github.io/admin.html`
2. Ingresa la contraseña configurada
3. **Agregar horarios disponibles**:
   - Pestaña "Horarios Disponibles"
   - Selecciona fecha y hora
   - Click en "Agregar Horario"
4. **Gestionar citas**:
   - Pestaña "Citas Pendientes" → Ver solicitudes nuevas
   - Click en "Aceptar" o "Rechazar"
   - Ver identificación adjunta
5. **Ver historial**:
   - Pestaña "Citas Confirmadas" → Ver todas las citas

### Para Clientes:

1. Ve a `https://tu-sitio.github.io/`
2. Selecciona un horario disponible
3. Completa el formulario con tus datos
4. Adjunta foto de identificación
5. Envía la solicitud
6. Recibirás un email de confirmación

## 🔧 Estructura del Proyecto

```
ciaociao-appointments/
├── index.html              # Página principal para clientes
├── admin.html              # Panel de administración
├── styles.css              # Estilos generales
├── app.js                  # Lógica del cliente
├── admin.js                # Lógica del admin
├── firebase-config.js      # Configuración (NO subir a GitHub público)
└── README.md              # Este archivo
```

## ⚠️ Seguridad

**IMPORTANTE**: Si tu repositorio es **público**:

1. **NO subas `firebase-config.js` a GitHub**:
   ```bash
   # Agregar a .gitignore
   echo "firebase-config.js" >> .gitignore
   ```

2. **Alternativa**: Crea `firebase-config.template.js` con valores de ejemplo:
   ```javascript
   export const firebaseConfig = {
       apiKey: "TU_API_KEY",
       authDomain: "TU_PROJECT.firebaseapp.com",
       // ...
   };
   ```

3. Los usuarios deben:
   - Copiar `firebase-config.template.js` → `firebase-config.js`
   - Llenar con sus propios valores

4. **Las reglas de Firestore y Storage ya protegen los datos** - los clientes no pueden leer/modificar citas ni identificaciones de otros usuarios.

## 🎨 Personalización

### Colores (en `styles.css`):
```css
:root {
    --primary-color: #d4af37;      /* Dorado */
    --secondary-color: #1a1a1a;    /* Negro */
    --success-color: #28a745;      /* Verde */
    --error-color: #dc3545;        /* Rojo */
}
```

### Logo:
Agrega tu logo en el header de `index.html` y `admin.html`

### Textos:
Personaliza todos los mensajes en los archivos HTML y JS

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
