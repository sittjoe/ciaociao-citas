# 🚀 Guía de Configuración - Sistema de Citas Ciao Ciao

## ✅ **YA ESTÁ HECHO:**
- ✅ Proyecto subido a GitHub: https://github.com/sittjoe/ciaociao-citas
- ✅ GitHub Pages activado
- ✅ Tu sitio estará en: **https://sittjoe.github.io/ciaociao-citas/**

---

## 📝 **LO QUE TIENES QUE HACER:**

### **PASO 1: Crear cuenta en Firebase (Base de datos)**

1. **Entra a:** https://console.firebase.google.com/
2. **Click en:** "Agregar proyecto" o "Add project"
3. **Nombre del proyecto:** `ciaociao-citas` (o el que quieras)
4. **Click:** Continuar → Continuar → Crear proyecto
5. **Espera** que termine de crear (1 minuto aprox)
6. **Click:** Continuar

---

### **PASO 2: Configurar Firestore (Base de datos)**

1. **En el menú izquierdo:** Click en "Compilación" o "Build"
2. **Click en:** "Firestore Database"
3. **Click en:** "Crear base de datos" o "Create database"
4. **Selecciona:** "Iniciar en modo de producción" → Siguiente
5. **Ubicación:** Selecciona la más cercana (ej: `us-central1` o `southamerica-east1`)
6. **Click:** Habilitar

**Ahora configura las reglas de seguridad:**

7. **Click en la pestaña:** "Reglas" o "Rules"
8. **Borra todo** lo que hay y pega esto:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /slots/{slotId} {
      allow read: if true;
      allow write: if false;
    }
    match /appointments/{appointmentId} {
      allow create: if true;
      allow read, update, delete: if false;
    }
  }
}
```

9. **Click:** Publicar

---

### **PASO 3: Configurar Storage (Para las fotos de identificación)**

1. **En el menú izquierdo:** Click en "Storage"
2. **Click en:** "Comenzar" o "Get started"
3. **Click:** Siguiente → Listo

**Ahora configura las reglas de seguridad:**

4. **Click en la pestaña:** "Rules"
5. **Borra todo** lo que hay y pega esto:

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

6. **Click:** Publicar

---

### **PASO 4: Obtener configuración de Firebase**

1. **Click en el ícono de engranaje** ⚙️ (arriba a la izquierda)
2. **Click en:** "Configuración del proyecto"
3. **Baja hasta:** "Tus aplicaciones"
4. **Click en:** el ícono `</>` (Web)
5. **Apodo de la app:** `ciaociao-web` → Click en "Registrar app"
6. **Verás un código** que dice `const firebaseConfig = {...}`
7. **COPIA** todo lo que está dentro de las llaves `{...}`

Ejemplo de lo que debes copiar:
```javascript
{
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXX",
  authDomain: "ciaociao-citas.firebaseapp.com",
  projectId: "ciaociao-citas",
  storageBucket: "ciaociao-citas.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:xxxxx"
}
```

8. **GUARDA** esto en un archivo de notas temporal

---

### **PASO 5: Crear cuenta en EmailJS (Para enviar correos)**

1. **Entra a:** https://www.emailjs.com/
2. **Click en:** "Sign Up" (crear cuenta)
3. **Llena el formulario** con tu email
4. **Verifica tu email** (revisa tu correo)

**Conectar tu email:**

5. **En el menú izquierdo:** Click en "Email Services"
6. **Click en:** "Add New Service"
7. **Selecciona:** Gmail (o el que uses)
8. **Click en:** "Connect Account"
9. **Autoriza** el acceso a tu email
10. **COPIA el Service ID** (algo como: `service_xxxxxxx`)
11. **Guárdalo** en tu archivo de notas

**Crear plantilla de email:**

12. **En el menú izquierdo:** Click en "Email Templates"
13. **Click en:** "Create New Template"
14. **Borra todo** y pega esto:

**Subject:**
```
{{subject}}
```

**Content:**
```
Hola {{to_name}},

{{message}}

---
Ciao Ciao Joyería
📍 [Tu dirección aquí]
📞 [Tu teléfono aquí]
📧 info@ciaociao.com
```

15. **Click en:** "Save" (arriba a la derecha)
16. **COPIA el Template ID** (algo como: `template_xxxxxxx`)
17. **Guárdalo** en tu archivo de notas

**Obtener Public Key:**

18. **En el menú izquierdo:** Click en "Account"
19. **Busca:** "API Keys"
20. **COPIA el Public Key** (algo como: `xxxxxxxxxxxxxxxxxxx`)
21. **Guárdalo** en tu archivo de notas

---

### **PASO 6: Configurar el archivo firebase-config.js**

1. **Abre** el archivo `firebase-config.js` de tu proyecto
2. **Reemplaza** los valores con los que copiaste:

```javascript
export const firebaseConfig = {
    apiKey: "PEGA_AQUI_TU_API_KEY",
    authDomain: "PEGA_AQUI_TU_AUTH_DOMAIN",
    projectId: "PEGA_AQUI_TU_PROJECT_ID",
    storageBucket: "PEGA_AQUI_TU_STORAGE_BUCKET",
    messagingSenderId: "PEGA_AQUI_TU_MESSAGING_SENDER_ID",
    appId: "PEGA_AQUI_TU_APP_ID"
};

export const ADMIN_PASSWORD = "ciaociao2025"; // ← CAMBIA ESTA CONTRASEÑA

export const emailConfig = {
    serviceId: "PEGA_AQUI_TU_SERVICE_ID",
    templateId: "PEGA_AQUI_TU_TEMPLATE_ID",
    publicKey: "PEGA_AQUI_TU_PUBLIC_KEY"
};
```

3. **Guarda el archivo**

---

### **PASO 7: Cambiar el email del administrador**

1. **Abre** el archivo `app.js`
2. **Busca la línea 136** (o busca: `to_email: 'admin@ciaociao.com'`)
3. **Cambia** `admin@ciaociao.com` por **TU EMAIL REAL**
4. **Guarda el archivo**

---

### **PASO 8: Subir los cambios a GitHub**

**En la terminal, ejecuta estos comandos:**

```bash
cd "/Users/joesittm/Desktop/agendador de citas ciao ciao"
git add .
git commit -m "Configuración de Firebase y EmailJS"
git push
```

---

### **PASO 9: Esperar y probar**

1. **Espera 2-3 minutos** (GitHub Pages tarda en actualizar)
2. **Entra a tu sitio:** https://sittjoe.github.io/ciaociao-citas/
3. **Prueba el panel de admin:**
   - Ve a: https://sittjoe.github.io/ciaociao-citas/admin.html
   - Contraseña: `ciaociao2025` (o la que pusiste)
   - Agrega algunos horarios disponibles

4. **Prueba la página principal:**
   - Ve a: https://sittjoe.github.io/ciaociao-citas/
   - Selecciona un horario
   - Llena el formulario
   - Envía una cita de prueba

5. **Revisa tu email** - deberían llegar 2 correos:
   - Uno confirmando la solicitud del cliente
   - Otro notificándote a ti de la nueva cita

6. **Vuelve al admin** y acepta/rechaza la cita

---

## 🎉 ¡LISTO!

Tu sistema está funcionando. Ahora puedes:
- Compartir el link con tus clientes
- Gestionar horarios desde el panel admin
- Aprobar o rechazar citas

---

## 📞 **AYUDA RÁPIDA**

### **¿No carga la página?**
- Espera 5 minutos más
- Revisa que los archivos estén en GitHub

### **¿No se cargan los horarios?**
- Verifica que Firebase esté configurado
- Revisa las reglas de Firestore
- Abre la consola del navegador (F12) y mira si hay errores

### **¿No llegan emails?**
- Verifica que EmailJS esté configurado
- Revisa que los IDs sean correctos
- Prueba enviar un email de prueba desde EmailJS

### **¿Olvidaste la contraseña de admin?**
- Cambia `ADMIN_PASSWORD` en `firebase-config.js`
- Sube los cambios a GitHub con `git push`

---

## 🔗 **LINKS IMPORTANTES**

- **Tu sitio web:** https://sittjoe.github.io/ciaociao-citas/
- **Panel admin:** https://sittjoe.github.io/ciaociao-citas/admin.html
- **GitHub repo:** https://github.com/sittjoe/ciaociao-citas
- **Firebase console:** https://console.firebase.google.com/
- **EmailJS dashboard:** https://dashboard.emailjs.com/

---

**¿Dudas? Revisa el archivo README.md para más detalles técnicos.**
