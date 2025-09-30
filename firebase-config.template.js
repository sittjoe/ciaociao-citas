// Firebase Configuration Template
// INSTRUCCIONES:
// 1. Copia este archivo y renómbralo a: firebase-config.js
// 2. Reemplaza todos los valores "TU_..." con tus datos reales de Firebase y EmailJS
// 3. NO subas firebase-config.js a GitHub si tu repositorio es público

export const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

// Contraseña de administrador
// IMPORTANTE: Cambia esto por una contraseña segura
export const ADMIN_PASSWORD = "ciaociao2025";

// Configuración de EmailJS
// Obtén estos valores desde https://www.emailjs.com/
export const emailConfig = {
    serviceId: "TU_SERVICE_ID",
    templateId: "TU_TEMPLATE_ID",
    publicKey: "TU_PUBLIC_KEY"
};

// NOTA: Después de configurar, no olvides:
// 1. Agregar el script de EmailJS en index.html y admin.html:
//    <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
//
// 2. Cambiar el email del administrador en app.js línea 136:
//    to_email: 'tu-email@ciaociao.com'
