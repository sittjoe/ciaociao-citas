# 📖 Manual de Usuario - Sistema de Citas Ciao Ciao

Guía completa para administrar el sistema de citas de tu joyería.

---

## 🎯 Tabla de Contenidos

1. [Acceso al Panel de Administración](#-1-acceso-al-panel-de-administración)
2. [Dashboard Principal](#-2-dashboard-principal)
3. [Gestión de Horarios](#-3-gestión-de-horarios)
4. [Gestión de Citas Pendientes](#-4-gestión-de-citas-pendientes)
5. [Gestión de Citas Confirmadas](#-5-gestión-de-citas-confirmadas)
6. [Funciones Avanzadas](#-6-funciones-avanzadas)
7. [Preguntas Frecuentes](#-7-preguntas-frecuentes)

---

## 🔐 1. Acceso al Panel de Administración

### 1.1 Iniciar Sesión

1. Ve a: `https://tu-proyecto-id.web.app/admin.html`
2. Ingresa tu contraseña de administrador
3. Haz clic en **"Iniciar Sesión"**

![Login](https://via.placeholder.com/800x400/0D0D0D/C9A55A?text=Panel+de+Login)

**⚠️ Nota de Seguridad:**
- La sesión permanece activa mientras el navegador esté abierto
- Si cierras el navegador, necesitarás ingresar la contraseña nuevamente
- Para cerrar sesión manualmente, haz clic en **"Cerrar Sesión"** (esquina superior derecha)

---

## 📊 2. Dashboard Principal

Al ingresar, verás el **Dashboard** con información clave sobre tu negocio.

### 2.1 Tarjetas de Estadísticas

El dashboard muestra 4 tarjetas principales:

1. **📅 Total Citas**
   - Número total de citas registradas
   - Incluye pendientes, aceptadas y rechazadas

2. **🕐 Pendientes**
   - Citas esperando tu aprobación
   - Requieren acción inmediata

3. **✅ Aceptadas Hoy**
   - Citas confirmadas en el día actual
   - Te ayuda a planificar tu jornada

4. **❌ Rechazadas**
   - Total de citas que has rechazado
   - Historial completo

### 2.2 Acciones Rápidas

Tres botones para acceso rápido:

- **➕ Agregar Horario:** Crea nuevos espacios disponibles
- **📋 Ver Pendientes:** Revisa solicitudes sin procesar
- **💾 Exportar Todo:** Descarga todas las citas en CSV

### 2.3 Próximas Citas

Lista de las **5 próximas citas confirmadas**, ordenadas por fecha y hora.

**Información mostrada:**
- Fecha abreviada (ej: "lun, ene 15")
- Hora (ej: "10:00")
- Nombre del cliente
- Teléfono de contacto

---

## 🕐 3. Gestión de Horarios

### 3.1 Agregar Nuevo Horario

1. Ve a la pestaña **"Horarios"**
2. En la sección **"Agregar Nuevo Horario"**:
   - **Fecha:** Selecciona la fecha del calendario
   - **Hora:** Selecciona la hora (formato 24h)
3. Haz clic en **"Agregar Horario"**

**✅ Validaciones automáticas:**
- Solo puedes agregar fechas futuras
- El sistema verifica que no sea una fecha pasada

**💡 Recomendaciones:**
- Agrega horarios con al menos 24 horas de anticipación
- Crea bloques de 30 minutos o 1 hora según tu preferencia
- Considera dejar tiempo entre citas para atención personalizada

### 3.2 Ver Horarios Disponibles

La lista muestra todos los horarios que están **disponibles** (sin citas asignadas).

**Formato de visualización:**
```
miércoles, 15 de enero de 2025 - 10:00
[Botón: Eliminar]
```

### 3.3 Eliminar Horario

1. Localiza el horario que deseas eliminar
2. Haz clic en **"Eliminar"**
3. Confirma la acción en el diálogo

**⚠️ Advertencia:**
- Solo puedes eliminar horarios que **no tengan citas asociadas**
- Si hay una cita pendiente/aceptada, primero debes rechazarla o cancelarla

---

## 📋 4. Gestión de Citas Pendientes

### 4.1 Ver Citas Pendientes

1. Ve a la pestaña **"Pendientes"**
2. Verás todas las solicitudes de citas esperando aprobación

**Cada tarjeta de cita muestra:**
- ☑️ Checkbox para selección múltiple
- 👤 Nombre del cliente
- 📅 Fecha y hora solicitada
- 📧 Email
- 📱 Teléfono
- 📝 Motivo de la visita (si lo proporcionó)
- 🏷️ Estado: **Pendiente**

### 4.2 Filtrar y Buscar

**Barra de filtros disponibles:**

1. **🔍 Búsqueda por texto:**
   - Busca por nombre, email o teléfono
   - Escribe y los resultados se actualizan en tiempo real

2. **📅 Filtro por fecha:**
   - **Desde:** Fecha inicial
   - **Hasta:** Fecha final
   - Filtra citas dentro del rango seleccionado

3. **🧹 Botón "Limpiar":**
   - Elimina todos los filtros aplicados
   - Vuelve a mostrar todas las citas

**Ejemplo de uso:**
```
Búsqueda: "Juan"
Desde: 2025-01-10
Hasta: 2025-01-20

Resultado: Todas las citas de personas llamadas Juan entre el 10 y 20 de enero
```

### 4.3 Ver Identificación del Cliente

1. Localiza la cita que deseas revisar
2. Haz clic en **"Ver Identificación"**
3. Se abrirá un modal mostrando:
   - Imagen de la identificación (JPG, PNG)
   - O documento PDF (con visor integrado)
4. Haz clic en **"Cerrar"** para volver

**💡 Tip:** Verifica siempre la identificación antes de aceptar una cita para garantizar la seguridad.

### 4.4 Aceptar una Cita

**Para aceptar una sola cita:**

1. Haz clic en el botón verde **"Aceptar"**
2. Confirma la acción en el diálogo
3. El sistema automáticamente:
   - ✅ Cambia el estado a "Aceptada"
   - 📧 Envía email de confirmación al cliente
   - 🚫 Marca el horario como NO disponible
   - 📊 Actualiza las estadísticas

**Email enviado al cliente:**
```
Asunto: Cita Confirmada - Ciao Ciao

Hola [Nombre],

¡Tu cita ha sido confirmada!

Fecha: miércoles, 15 de enero de 2025
Hora: 10:00

Te esperamos en nuestro showroom.

Ciao Ciao Joyería
```

### 4.5 Rechazar una Cita

**Para rechazar una sola cita:**

1. Haz clic en el botón rojo **"Rechazar"**
2. Confirma la acción en el diálogo
3. El sistema automáticamente:
   - ❌ Cambia el estado a "Rechazada"
   - 📧 Envía email de rechazo al cliente
   - ✅ El horario sigue disponible para otros clientes
   - 📊 Actualiza las estadísticas

**Email enviado al cliente:**
```
Asunto: Solicitud de Cita - Ciao Ciao

Hola [Nombre],

Lamentamos informarte que no podemos confirmar tu cita en el horario solicitado.

Por favor, visita nuestra página para seleccionar otro horario disponible.

Ciao Ciao Joyería
```

### 4.6 Acciones en Lote (Múltiples Citas)

**Para procesar varias citas a la vez:**

1. **Selecciona citas:**
   - Marca los checkboxes de las citas que deseas procesar
   - Aparecerá una barra amarilla mostrando: "[X] seleccionadas"

2. **Opciones disponibles:**
   - **Aceptar Seleccionadas:** Confirma todas las citas marcadas
   - **Rechazar Seleccionadas:** Rechaza todas las citas marcadas

3. **Confirmación:**
   - El sistema te pedirá confirmar la acción
   - Mostrará cuántas citas serán procesadas

4. **Proceso automático:**
   - Se enviarán todos los emails correspondientes
   - Las estadísticas se actualizarán
   - Recibirás una notificación de éxito

**💡 Casos de uso:**
- Aceptar todas las citas de un día específico
- Rechazar citas duplicadas rápidamente
- Procesar múltiples solicitudes en un solo clic

---

## ✅ 5. Gestión de Citas Confirmadas

### 5.1 Ver Citas Confirmadas y Rechazadas

1. Ve a la pestaña **"Confirmadas"**
2. Verás el historial completo de citas procesadas

**Cada tarjeta muestra:**
- 👤 Nombre del cliente
- 📅 Fecha y hora
- 📧 Email
- 📱 Teléfono
- 📝 Motivo de la visita
- 🏷️ Estado: **Aceptada** (verde) o **Rechazada** (rojo)

### 5.2 Filtrar Historial

**Filtros disponibles:**

1. **🔍 Búsqueda por texto:**
   - Busca por nombre, email o teléfono

2. **📊 Filtro por estado:**
   - **Todos los estados:** Muestra todo
   - **Aceptadas:** Solo citas confirmadas
   - **Rechazadas:** Solo citas rechazadas

3. **📅 Filtro por fecha:**
   - **Desde:** Fecha inicial
   - **Hasta:** Fecha final

4. **🧹 Botón "Limpiar":**
   - Elimina todos los filtros

**Ejemplo de uso:**
```
Estado: Aceptadas
Desde: 2025-01-01
Hasta: 2025-01-31

Resultado: Todas las citas aceptadas en enero 2025
```

### 5.3 Ver Identificación (Historial)

Puedes revisar la identificación de cualquier cita confirmada o rechazada:

1. Haz clic en **"Ver Identificación"**
2. Se abrirá el modal con el documento
3. Haz clic en **"Cerrar"** para volver

---

## 🚀 6. Funciones Avanzadas

### 6.1 Exportar a CSV

**¿Qué es CSV?**
- Formato de archivo compatible con Excel, Google Sheets, etc.
- Te permite analizar datos, crear reportes y hacer respaldos

**Opciones de exportación:**

1. **Exportar Pendientes:**
   - Pestaña "Pendientes" → Botón **"Exportar CSV"**
   - Descarga: `citas-pendientes-2025-01-15.csv`

2. **Exportar Confirmadas:**
   - Pestaña "Confirmadas" → Botón **"Exportar CSV"**
   - Descarga: `citas-confirmadas-2025-01-15.csv`

3. **Exportar Todas:**
   - Dashboard → Botón **"Exportar Todo"**
   - Descarga: `todas-las-citas-2025-01-15.csv`

**Columnas incluidas en el CSV:**
- Nombre
- Email
- Teléfono
- Fecha
- Hora
- Estado
- Notas

**💡 Casos de uso:**
- Crear reportes mensuales
- Analizar horarios más solicitados
- Respaldo de información
- Importar a tu CRM

### 6.2 Notificaciones Toast

El sistema muestra notificaciones elegantes en la esquina superior derecha:

**Tipos de notificaciones:**

1. **✅ Éxito (Verde):**
   - "Horario agregado exitosamente"
   - "Cita aceptada exitosamente"
   - "CSV exportado exitosamente"

2. **❌ Error (Rojo):**
   - "Error al agregar horario"
   - "Error al cargar citas"
   - "La fecha debe ser futura"

**Características:**
- Aparecen automáticamente
- Desaparecen después de 3 segundos
- No interrumpen tu trabajo

### 6.3 Navegación entre Tabs

**Atajos desde el Dashboard:**

1. **Agregar Horario** → Te lleva directo a la pestaña "Horarios"
2. **Ver Pendientes** → Te lleva directo a la pestaña "Pendientes"
3. **Exportar Todo** → Descarga CSV sin cambiar de pestaña

**Navegación manual:**
- Haz clic en cualquier pestaña del menú superior
- La pestaña activa se marca en color dorado

---

## ❓ 7. Preguntas Frecuentes

### ¿Cómo cambio mi contraseña de administrador?

1. Edita el archivo `firebase-config.js`
2. Cambia el valor de `ADMIN_PASSWORD`
3. Vuelve a desplegar el sitio

### ¿Cuántos horarios puedo agregar?

No hay límite. Puedes agregar tantos horarios como necesites.

### ¿Puedo editar una cita después de aceptarla?

No directamente desde el panel. Si necesitas modificar una cita:
1. Contacta al cliente por email/teléfono
2. Rechaza la cita actual
3. El cliente puede agendar una nueva

### ¿Qué pasa si elimino un horario con cita pendiente?

No puedes. El sistema no te permite eliminar horarios con citas asociadas.

### ¿Cuánto tiempo se guardan las citas?

Indefinidamente. Todas las citas quedan guardadas en Firebase.

### ¿Puedo tener múltiples administradores?

Sí, solo comparte la contraseña con las personas autorizadas.

### ¿Los clientes reciben emails automáticamente?

Sí, cuando aceptas o rechazas una cita, el email se envía automáticamente.

### ¿Qué hago si un email no se envía?

Verifica:
1. Que EmailJS esté configurado correctamente
2. Que no hayas excedido tu cuota mensual (200 emails gratis)
3. Que el email del cliente sea válido

### ¿Puedo personalizar los emails?

Sí, edita los templates en el dashboard de EmailJS.

### ¿El sistema es responsive?

Sí, funciona perfectamente en computadoras, tablets y teléfonos.

---

## 📱 Contacto y Soporte

**Si necesitas ayuda adicional:**

1. 🔍 Revisa el archivo `SETUP.md` para problemas técnicos
2. 📧 Revisa la consola del navegador (F12 → Console)
3. 🔥 Verifica Firebase Console para errores de base de datos
4. 📊 Revisa los logs de Firebase Hosting

---

## 🎓 Consejos de Uso Profesional

### Para mejorar tu flujo de trabajo:

1. **✅ Revisa citas pendientes diariamente**
   - Establece un horario fijo (ej: 9:00 AM)
   - Los clientes aprecian respuestas rápidas

2. **📅 Planifica horarios con anticipación**
   - Agrega horarios para toda la semana
   - Considera días festivos y vacaciones

3. **📊 Exporta reportes mensuales**
   - Analiza tendencias de citas
   - Identifica horarios más populares

4. **🔐 Protege tu contraseña**
   - No la compartas por email
   - Cámbiala periódicamente

5. **💾 Haz respaldos regulares**
   - Exporta CSV mensualmente
   - Guarda en Google Drive o Dropbox

6. **📧 Personaliza tus respuestas**
   - Considera agregar notas en los emails
   - Menciona promociones especiales

---

## ✨ ¡Disfruta tu Sistema de Citas!

Ahora tienes todo el conocimiento para administrar profesionalmente las citas de tu joyería.

**Recuerda:**
- 🎯 Responde rápido a las solicitudes
- 💎 Ofrece atención personalizada
- 📊 Analiza tus datos regularmente
- 🔐 Mantén la seguridad de tu sistema

---

**Hecho con 💎 para Ciao Ciao Joyería**

*Última actualización: Enero 2025*
