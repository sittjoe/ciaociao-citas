import { firebaseConfig, ADMIN_PASSWORD, emailConfig } from './firebase-config.js';

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let isAuthenticated = false;

// Load EmailJS
(function() {
    emailjs.init(emailConfig.publicKey);
})();

// Check authentication
function checkAuth() {
    const authToken = sessionStorage.getItem('adminAuth');
    if (authToken === 'authenticated') {
        isAuthenticated = true;
        showDashboard();
    }
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;

    if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem('adminAuth', 'authenticated');
        isAuthenticated = true;
        showDashboard();
    } else {
        document.getElementById('loginError').textContent = 'Contraseña incorrecta';
        document.getElementById('loginError').style.display = 'block';
    }
});

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('adminAuth');
    location.reload();
});

// Show dashboard
function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    loadAllData();
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

// Add slot form handler
document.getElementById('addSlotForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('slotDate').value;
    const time = document.getElementById('slotTime').value;

    if (!date || !time) {
        alert('Por favor completa todos los campos');
        return;
    }

    try {
        const datetime = new Date(`${date}T${time}`);

        // Check if it's in the future
        if (datetime <= new Date()) {
            alert('La fecha y hora deben ser en el futuro');
            return;
        }

        const slotsRef = collection(db, 'slots');
        await addDoc(slotsRef, {
            datetime: Timestamp.fromDate(datetime),
            available: true,
            createdAt: serverTimestamp()
        });

        // Reset form
        document.getElementById('addSlotForm').reset();

        // Reload slots
        loadSlots();

        alert('Horario agregado exitosamente');
    } catch (error) {
        console.error('Error adding slot:', error);
        alert('Error al agregar horario: ' + error.message);
    }
});

// Load all data
function loadAllData() {
    loadSlots();
    loadAppointments();
}

// Load slots
async function loadSlots() {
    try {
        const slotsRef = collection(db, 'slots');
        const q = query(
            slotsRef,
            where('available', '==', true),
            orderBy('datetime', 'asc')
        );

        const querySnapshot = await getDocs(q);
        const slots = [];

        querySnapshot.forEach((doc) => {
            const slotData = doc.data();
            slots.push({
                id: doc.id,
                ...slotData,
                datetime: slotData.datetime.toDate()
            });
        });

        displaySlots(slots);
    } catch (error) {
        console.error('Error loading slots:', error);
        document.getElementById('slotsList').innerHTML = '<p style="color: var(--error-color);">Error al cargar horarios</p>';
    }
}

// Display slots
function displaySlots(slots) {
    const container = document.getElementById('slotsList');

    if (slots.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No hay horarios disponibles</p>';
        return;
    }

    container.innerHTML = slots.map(slot => {
        const dateStr = slot.datetime.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = slot.datetime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="slot-item">
                <div>
                    <strong>${dateStr}</strong> - ${timeStr}
                </div>
                <button class="delete-btn" onclick="deleteSlot('${slot.id}')">Eliminar</button>
            </div>
        `;
    }).join('');
}

// Delete slot
window.deleteSlot = async (slotId) => {
    if (!confirm('¿Estás seguro de eliminar este horario?')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'slots', slotId));
        loadSlots();
        alert('Horario eliminado exitosamente');
    } catch (error) {
        console.error('Error deleting slot:', error);
        alert('Error al eliminar horario: ' + error.message);
    }
};

// Load appointments
async function loadAppointments() {
    try {
        const appointmentsRef = collection(db, 'appointments');
        const q = query(appointmentsRef, orderBy('createdAt', 'desc'));

        const querySnapshot = await getDocs(q);
        const pending = [];
        const confirmed = [];

        querySnapshot.forEach((doc) => {
            const appointmentData = doc.data();
            const appointment = {
                id: doc.id,
                ...appointmentData,
                slotDatetime: appointmentData.slotDatetime.toDate()
            };

            if (appointment.status === 'pending') {
                pending.push(appointment);
            } else {
                confirmed.push(appointment);
            }
        });

        displayPendingAppointments(pending);
        displayConfirmedAppointments(confirmed);
    } catch (error) {
        console.error('Error loading appointments:', error);
    }
}

// Display pending appointments
function displayPendingAppointments(appointments) {
    const container = document.getElementById('pendingAppointments');

    if (appointments.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No hay citas pendientes</p>';
        return;
    }

    container.innerHTML = appointments.map(apt => {
        const dateStr = apt.slotDatetime.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = apt.slotDatetime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="appointment-card">
                <div class="appointment-header">
                    <div>
                        <h3>${apt.name}</h3>
                        <p style="color: var(--text-light);">${dateStr} - ${timeStr}</p>
                    </div>
                    <span class="appointment-status status-pending">Pendiente</span>
                </div>
                <div class="appointment-info">
                    <p><strong>Email:</strong> ${apt.email}</p>
                    <p><strong>Teléfono:</strong> ${apt.phone}</p>
                    ${apt.notes ? `<p><strong>Notas:</strong> ${apt.notes}</p>` : ''}
                </div>
                <div class="appointment-actions">
                    <button class="accept-btn" onclick="acceptAppointment('${apt.id}', '${apt.email}', '${apt.name}', '${dateStr}', '${timeStr}')">Aceptar</button>
                    <button class="reject-btn" onclick="rejectAppointment('${apt.id}', '${apt.email}', '${apt.name}')">Rechazar</button>
                    ${apt.identificationUrl ? `<button class="view-id-btn" onclick="viewIdentification('${apt.identificationUrl}')">Ver Identificación</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Display confirmed appointments
function displayConfirmedAppointments(appointments) {
    const container = document.getElementById('confirmedAppointments');

    if (appointments.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No hay citas confirmadas o rechazadas</p>';
        return;
    }

    container.innerHTML = appointments.map(apt => {
        const dateStr = apt.slotDatetime.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = apt.slotDatetime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const statusClass = apt.status === 'accepted' ? 'status-accepted' : 'status-rejected';
        const statusText = apt.status === 'accepted' ? 'Aceptada' : 'Rechazada';
        const cardClass = apt.status === 'accepted' ? 'accepted' : 'rejected';

        return `
            <div class="appointment-card ${cardClass}">
                <div class="appointment-header">
                    <div>
                        <h3>${apt.name}</h3>
                        <p style="color: var(--text-light);">${dateStr} - ${timeStr}</p>
                    </div>
                    <span class="appointment-status ${statusClass}">${statusText}</span>
                </div>
                <div class="appointment-info">
                    <p><strong>Email:</strong> ${apt.email}</p>
                    <p><strong>Teléfono:</strong> ${apt.phone}</p>
                    ${apt.notes ? `<p><strong>Notas:</strong> ${apt.notes}</p>` : ''}
                </div>
                ${apt.identificationUrl ? `<button class="view-id-btn" onclick="viewIdentification('${apt.identificationUrl}')">Ver Identificación</button>` : ''}
            </div>
        `;
    }).join('');
}

// Accept appointment
window.acceptAppointment = async (appointmentId, email, name, dateStr, timeStr) => {
    if (!confirm('¿Confirmar esta cita?')) {
        return;
    }

    try {
        // Update appointment status
        await updateDoc(doc(db, 'appointments', appointmentId), {
            status: 'accepted',
            updatedAt: serverTimestamp()
        });

        // Get appointment data to mark slot as unavailable
        const appointmentRef = doc(db, 'appointments', appointmentId);
        const appointmentDoc = await getDocs(query(collection(db, 'appointments'), where('__name__', '==', appointmentId)));

        let slotId = null;
        appointmentDoc.forEach(doc => {
            slotId = doc.data().slotId;
        });

        if (slotId) {
            await updateDoc(doc(db, 'slots', slotId), {
                available: false
            });
        }

        // Send confirmation email
        await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
            to_email: email,
            to_name: name,
            subject: 'Cita Confirmada - Ciao Ciao',
            message: `Hola ${name},\n\n¡Tu cita ha sido confirmada!\n\nFecha: ${dateStr}\nHora: ${timeStr}\n\nTe esperamos en nuestro showroom.\n\nCiao Ciao Joyería`
        });

        loadAllData();
        alert('Cita aceptada exitosamente');
    } catch (error) {
        console.error('Error accepting appointment:', error);
        alert('Error al aceptar cita: ' + error.message);
    }
};

// Reject appointment
window.rejectAppointment = async (appointmentId, email, name) => {
    if (!confirm('¿Rechazar esta cita?')) {
        return;
    }

    try {
        // Update appointment status
        await updateDoc(doc(db, 'appointments', appointmentId), {
            status: 'rejected',
            updatedAt: serverTimestamp()
        });

        // Send rejection email
        await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
            to_email: email,
            to_name: name,
            subject: 'Solicitud de Cita - Ciao Ciao',
            message: `Hola ${name},\n\nLamentamos informarte que no podemos confirmar tu cita en el horario solicitado.\n\nPor favor, visita nuestra página para seleccionar otro horario disponible.\n\nCiao Ciao Joyería`
        });

        loadAllData();
        alert('Cita rechazada');
    } catch (error) {
        console.error('Error rejecting appointment:', error);
        alert('Error al rechazar cita: ' + error.message);
    }
};

// View identification
window.viewIdentification = (url) => {
    const modal = document.getElementById('idModal');
    const content = document.getElementById('idContent');

    if (url.endsWith('.pdf')) {
        content.innerHTML = `<iframe src="${url}" style="width: 100%; height: 600px; border: none;"></iframe>`;
    } else {
        content.innerHTML = `<img src="${url}" style="max-width: 100%; height: auto;">`;
    }

    modal.style.display = 'block';
};

window.closeIdModal = () => {
    document.getElementById('idModal').style.display = 'none';
};

// Set minimum date for slot picker to today
document.getElementById('slotDate').min = new Date().toISOString().split('T')[0];

// Initialize
checkAuth();
