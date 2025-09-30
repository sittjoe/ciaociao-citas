import { firebaseConfig, emailConfig } from './firebase-config.js';

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let selectedSlot = null;
let availableSlots = [];

// Load EmailJS
(function() {
    emailjs.init(emailConfig.publicKey);
})();

// Load available slots
async function loadAvailableSlots() {
    try {
        const slotsRef = collection(db, 'slots');
        const q = query(
            slotsRef,
            where('available', '==', true),
            orderBy('datetime', 'asc')
        );

        const querySnapshot = await getDocs(q);
        availableSlots = [];

        querySnapshot.forEach((doc) => {
            const slotData = doc.data();
            const slotDate = slotData.datetime.toDate();

            // Only show future slots
            if (slotDate > new Date()) {
                availableSlots.push({
                    id: doc.id,
                    ...slotData,
                    datetime: slotDate
                });
            }
        });

        displaySlots();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('bookingForm').style.display = 'block';
    } catch (error) {
        console.error('Error loading slots:', error);
        showError('Error al cargar los horarios disponibles. Por favor, intenta más tarde.');
    }
}

// Display slots
function displaySlots() {
    const container = document.getElementById('availableSlots');

    if (availableSlots.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 40px;">No hay horarios disponibles en este momento.</p>';
        return;
    }

    container.innerHTML = availableSlots.map(slot => {
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
            <div class="slot-card" data-slot-id="${slot.id}">
                <div class="slot-date">${dateStr}</div>
                <div class="slot-time">${timeStr}</div>
            </div>
        `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.slot-card').forEach(card => {
        card.addEventListener('click', () => selectSlot(card.dataset.slotId));
    });
}

// Select slot
function selectSlot(slotId) {
    selectedSlot = availableSlots.find(s => s.id === slotId);

    // Update UI
    document.querySelectorAll('.slot-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-slot-id="${slotId}"]`).classList.add('selected');

    // Update display
    const dateStr = selectedSlot.datetime.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = selectedSlot.datetime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    document.getElementById('selectedSlotDisplay').textContent = `${dateStr} a las ${timeStr}`;
    document.getElementById('submitBtn').disabled = false;
}

// Handle form submission
document.getElementById('appointmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedSlot) {
        alert('Por favor selecciona un horario');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
        // Get form data
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            notes: document.getElementById('notes').value,
            slotId: selectedSlot.id,
            slotDatetime: selectedSlot.datetime,
            status: 'pending',
            createdAt: serverTimestamp()
        };

        // Upload identification
        const idFile = document.getElementById('identification').files[0];
        if (idFile) {
            // Check file size (5MB max)
            if (idFile.size > 5 * 1024 * 1024) {
                throw new Error('El archivo es muy grande. Máximo 5MB.');
            }

            const idRef = ref(storage, `identifications/${Date.now()}_${idFile.name}`);
            const snapshot = await uploadBytes(idRef, idFile);
            formData.identificationUrl = await getDownloadURL(snapshot.ref);
        }

        // Save appointment
        const appointmentsRef = collection(db, 'appointments');
        const docRef = await addDoc(appointmentsRef, formData);

        // Send confirmation emails
        await sendConfirmationEmails(formData, docRef.id);

        // Show success message
        document.getElementById('bookingForm').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';

    } catch (error) {
        console.error('Error submitting appointment:', error);
        showError(error.message || 'Error al enviar la solicitud. Por favor, intenta de nuevo.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Solicitud de Cita';
    }
});

// Send confirmation emails
async function sendConfirmationEmails(appointmentData, appointmentId) {
    const dateStr = appointmentData.slotDatetime.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = appointmentData.slotDatetime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Email to client
    try {
        await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
            to_email: appointmentData.email,
            to_name: appointmentData.name,
            subject: 'Solicitud de Cita Recibida - Ciao Ciao',
            message: `Hola ${appointmentData.name},\n\nHemos recibido tu solicitud de cita para el ${dateStr} a las ${timeStr}.\n\nRevisaremos tu solicitud y te enviaremos una confirmación pronto.\n\nGracias por elegir Ciao Ciao Joyería.`
        });
    } catch (error) {
        console.error('Error sending client email:', error);
    }

    // Email to admin
    try {
        await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
            to_email: 'admin@ciaociao.com', // Cambia esto a tu email
            to_name: 'Admin',
            subject: 'Nueva Solicitud de Cita - Ciao Ciao',
            message: `Nueva solicitud de cita:\n\nCliente: ${appointmentData.name}\nEmail: ${appointmentData.email}\nTeléfono: ${appointmentData.phone}\nFecha: ${dateStr}\nHora: ${timeStr}\nNotas: ${appointmentData.notes || 'N/A'}\n\nID de cita: ${appointmentId}\n\nRevisa el panel de administración para aprobar o rechazar.`
        });
    } catch (error) {
        console.error('Error sending admin email:', error);
    }
}

// Show error message
function showError(message) {
    document.getElementById('bookingForm').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'block';
    document.getElementById('errorText').textContent = message;
}

// Initialize
loadAvailableSlots();
