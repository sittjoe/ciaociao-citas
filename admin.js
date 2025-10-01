/**
 * ADMIN.JS - Panel de Administración Mejorado
 * Gestión avanzada de citas con dashboard, filtros, búsqueda y exportación
 */

import { firebaseConfig, ADMIN_PASSWORD, emailConfig } from './firebase-config.js';

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Estado global
let isAuthenticated = false;
let allAppointments = [];
let allSlots = [];
let selectedAppointments = new Set();

// Charts instances
let statusChart = null;
let weekChart = null;

// Load EmailJS
(function() {
    emailjs.init(emailConfig.publicKey);
})();

// ============================================
// AUTENTICACIÓN
// ============================================

function checkAuth() {
    const authToken = sessionStorage.getItem('adminAuth');
    if (authToken === 'authenticated') {
        isAuthenticated = true;
        showDashboard();
    }
}

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

document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('adminAuth');
    location.reload();
});

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    loadAllData();
}

// ============================================
// NOTIFICACIONES TOAST
// ============================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ?
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' :
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// NAVEGACIÓN DE TABS
// ============================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        switchTab(tabName);
    });
});

window.switchTab = function(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
};

// ============================================
// GESTIÓN DE HORARIOS
// ============================================

document.getElementById('addSlotForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('slotDate').value;
    const time = document.getElementById('slotTime').value;

    if (!date || !time) {
        showToast('Por favor completa todos los campos', 'error');
        return;
    }

    try {
        const datetime = new Date(`${date}T${time}`);

        // Check if it's in the future
        if (datetime <= new Date()) {
            showToast('La fecha y hora deben ser en el futuro', 'error');
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
        await loadSlots();

        showToast('Horario agregado exitosamente');
    } catch (error) {
        console.error('Error adding slot:', error);
        showToast('Error al agregar horario: ' + error.message, 'error');
    }
});

async function loadSlots() {
    try {
        const slotsRef = collection(db, 'slots');
        const q = query(
            slotsRef,
            where('available', '==', true),
            orderBy('datetime', 'asc')
        );

        const querySnapshot = await getDocs(q);
        allSlots = [];

        querySnapshot.forEach((doc) => {
            const slotData = doc.data();
            allSlots.push({
                id: doc.id,
                ...slotData,
                datetime: slotData.datetime.toDate()
            });
        });

        displaySlots(allSlots);
    } catch (error) {
        console.error('Error loading slots:', error);
        document.getElementById('slotsList').innerHTML = '<p style="color: var(--error-color);">Error al cargar horarios</p>';
    }
}

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

window.deleteSlot = async (slotId) => {
    if (!confirm('¿Estás seguro de eliminar este horario?')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'slots', slotId));
        await loadSlots();
        showToast('Horario eliminado exitosamente');
    } catch (error) {
        console.error('Error deleting slot:', error);
        showToast('Error al eliminar horario: ' + error.message, 'error');
    }
};

// ============================================
// GESTIÓN DE CITAS
// ============================================

async function loadAllData() {
    await Promise.all([loadSlots(), loadAppointments()]);
    updateDashboardStats();
}

async function loadAppointments() {
    try {
        const appointmentsRef = collection(db, 'appointments');
        const q = query(appointmentsRef, orderBy('createdAt', 'desc'));

        const querySnapshot = await getDocs(q);
        allAppointments = [];

        querySnapshot.forEach((doc) => {
            const appointmentData = doc.data();
            allAppointments.push({
                id: doc.id,
                ...appointmentData,
                slotDatetime: appointmentData.slotDatetime.toDate()
            });
        });

        filterAndDisplayAppointments();
    } catch (error) {
        console.error('Error loading appointments:', error);
        showToast('Error al cargar citas', 'error');
    }
}

function filterAndDisplayAppointments() {
    const pending = allAppointments.filter(apt => apt.status === 'pending');
    const confirmed = allAppointments.filter(apt => apt.status !== 'pending');

    displayPendingAppointments(pending);
    displayConfirmedAppointments(confirmed);
    displayUpcomingAppointments(allAppointments);
}

// ============================================
// DASHBOARD Y ESTADÍSTICAS
// ============================================

function updateDashboardStats() {
    const total = allAppointments.length;
    const pending = allAppointments.filter(apt => apt.status === 'pending').length;
    const accepted = allAppointments.filter(apt => apt.status === 'accepted').length;
    const rejected = allAppointments.filter(apt => apt.status === 'rejected').length;

    // Accepted today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const acceptedToday = allAppointments.filter(apt => {
        if (apt.status === 'accepted' && apt.updatedAt) {
            const aptDate = apt.updatedAt.toDate();
            aptDate.setHours(0, 0, 0, 0);
            return aptDate.getTime() === today.getTime();
        }
        return false;
    }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statAcceptedToday').textContent = acceptedToday;
    document.getElementById('statRejected').textContent = rejected;

    // Initialize or update charts
    initializeCharts(pending, accepted, rejected);
    updateWeekChart();
}

// ============================================
// GRÁFICAS CON CHART.JS
// ============================================

function initializeCharts(pending, accepted, rejected) {
    // Status Pie Chart
    const statusCtx = document.getElementById('statusChart');
    if (!statusCtx) return;

    if (statusChart) {
        statusChart.destroy();
    }

    statusChart = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Pendientes', 'Aceptadas', 'Rechazadas'],
            datasets: [{
                data: [pending, accepted, rejected],
                backgroundColor: [
                    'rgba(255, 167, 38, 0.8)',
                    'rgba(102, 187, 106, 0.8)',
                    'rgba(239, 83, 80, 0.8)'
                ],
                borderColor: [
                    '#FFA726',
                    '#66BB6A',
                    '#EF5350'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            family: 'Inter',
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(13, 13, 13, 0.9)',
                    padding: 12,
                    titleFont: {
                        family: 'Inter',
                        size: 14
                    },
                    bodyFont: {
                        family: 'Inter',
                        size: 13
                    }
                }
            }
        }
    });
}

function updateWeekChart() {
    const weekCtx = document.getElementById('weekChart');
    if (!weekCtx) return;

    // Calculate appointments per day for last 7 days
    const today = new Date();
    const days = [];
    const counts = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
        const dayCount = allAppointments.filter(apt => {
            if (apt.slotDatetime) {
                const aptDate = new Date(apt.slotDatetime.toDate());
                aptDate.setHours(0, 0, 0, 0);
                return aptDate.getTime() === date.getTime();
            }
            return false;
        }).length;

        days.push(dayName);
        counts.push(dayCount);
    }

    if (weekChart) {
        weekChart.destroy();
    }

    weekChart = new Chart(weekCtx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Citas',
                data: counts,
                backgroundColor: 'rgba(201, 165, 90, 0.8)',
                borderColor: '#C9A55A',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(13, 13, 13, 0.9)',
                    padding: 12,
                    titleFont: {
                        family: 'Inter',
                        size: 14
                    },
                    bodyFont: {
                        family: 'Inter',
                        size: 13
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function displayUpcomingAppointments(appointments) {
    const container = document.getElementById('upcomingAppointments');
    const now = new Date();

    const upcoming = appointments
        .filter(apt => apt.status === 'accepted' && apt.slotDatetime > now)
        .sort((a, b) => a.slotDatetime - b.slotDatetime)
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No hay citas próximas confirmadas</p>';
        return;
    }

    container.innerHTML = upcoming.map(apt => {
        const dateStr = apt.slotDatetime.toLocaleDateString('es-ES', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        const timeStr = apt.slotDatetime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="upcoming-item">
                <div class="upcoming-time">
                    <strong>${dateStr}</strong>
                    <span>${timeStr}</span>
                </div>
                <div class="upcoming-info">
                    <strong>${apt.name}</strong>
                    <span>${apt.phone}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// CITAS PENDIENTES CON FILTROS
// ============================================

function displayPendingAppointments(appointments) {
    const container = document.getElementById('pendingAppointments');

    // Apply filters
    const searchTerm = document.getElementById('searchPending')?.value.toLowerCase() || '';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';

    let filtered = appointments;

    if (searchTerm) {
        filtered = filtered.filter(apt =>
            apt.name.toLowerCase().includes(searchTerm) ||
            apt.email.toLowerCase().includes(searchTerm) ||
            apt.phone.includes(searchTerm)
        );
    }

    if (dateFrom) {
        const fromDate = new Date(dateFrom);
        filtered = filtered.filter(apt => apt.slotDatetime >= fromDate);
    }

    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(apt => apt.slotDatetime <= toDate);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No hay citas pendientes</p>';
        return;
    }

    container.innerHTML = filtered.map(apt => {
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

        const isSelected = selectedAppointments.has(apt.id);

        return `
            <div class="appointment-card ${isSelected ? 'selected' : ''}">
                <input type="checkbox" class="appointment-checkbox"
                       data-id="${apt.id}"
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleAppointmentSelection('${apt.id}')">
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
                    <button class="accept-btn" onclick="acceptAppointment('${apt.id}', '${apt.email}', '${apt.name}', '${apt.slotId}', '${dateStr}', '${timeStr}')">Aceptar</button>
                    <button class="reject-btn" onclick="rejectAppointment('${apt.id}', '${apt.email}', '${apt.name}', '${apt.slotId}')">Rechazar</button>
                    ${apt.identificationUrl ? `<button class="view-id-btn" onclick="viewIdentification('${apt.identificationUrl}')">Ver Identificación</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    updateBulkActionsVisibility();
}

// ============================================
// CITAS CONFIRMADAS CON FILTROS
// ============================================

function displayConfirmedAppointments(appointments) {
    const container = document.getElementById('confirmedAppointments');

    // Apply filters
    const searchTerm = document.getElementById('searchConfirmed')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const dateFrom = document.getElementById('filterDateFromConfirmed')?.value || '';
    const dateTo = document.getElementById('filterDateToConfirmed')?.value || '';

    let filtered = appointments;

    if (searchTerm) {
        filtered = filtered.filter(apt =>
            apt.name.toLowerCase().includes(searchTerm) ||
            apt.email.toLowerCase().includes(searchTerm) ||
            apt.phone.includes(searchTerm)
        );
    }

    if (statusFilter) {
        filtered = filtered.filter(apt => apt.status === statusFilter);
    }

    if (dateFrom) {
        const fromDate = new Date(dateFrom);
        filtered = filtered.filter(apt => apt.slotDatetime >= fromDate);
    }

    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(apt => apt.slotDatetime <= toDate);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No hay citas confirmadas o rechazadas</p>';
        return;
    }

    container.innerHTML = filtered.map(apt => {
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

// ============================================
// FILTROS Y BÚSQUEDA
// ============================================

// Event listeners for filters
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.getElementById('searchPending')?.addEventListener('input', filterAndDisplayAppointments);
        document.getElementById('filterDateFrom')?.addEventListener('change', filterAndDisplayAppointments);
        document.getElementById('filterDateTo')?.addEventListener('change', filterAndDisplayAppointments);

        document.getElementById('searchConfirmed')?.addEventListener('input', filterAndDisplayAppointments);
        document.getElementById('filterStatus')?.addEventListener('change', filterAndDisplayAppointments);
        document.getElementById('filterDateFromConfirmed')?.addEventListener('change', filterAndDisplayAppointments);
        document.getElementById('filterDateToConfirmed')?.addEventListener('change', filterAndDisplayAppointments);
    }, 1000);
});

window.clearFilters = function(tab) {
    if (tab === 'pending') {
        document.getElementById('searchPending').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
    } else if (tab === 'confirmed') {
        document.getElementById('searchConfirmed').value = '';
        document.getElementById('filterStatus').value = '';
        document.getElementById('filterDateFromConfirmed').value = '';
        document.getElementById('filterDateToConfirmed').value = '';
    }
    filterAndDisplayAppointments();
};

// ============================================
// ACCIONES EN LOTE (BULK ACTIONS)
// ============================================

window.toggleAppointmentSelection = function(appointmentId) {
    if (selectedAppointments.has(appointmentId)) {
        selectedAppointments.delete(appointmentId);
    } else {
        selectedAppointments.add(appointmentId);
    }
    updateBulkActionsVisibility();
    filterAndDisplayAppointments();
};

function updateBulkActionsVisibility() {
    const bulkActions = document.getElementById('bulkActionsPending');
    const count = selectedAppointments.size;

    if (count > 0) {
        bulkActions.style.display = 'flex';
        document.getElementById('selectedCountPending').textContent = count;
    } else {
        bulkActions.style.display = 'none';
    }
}

window.bulkAccept = async function() {
    if (selectedAppointments.size === 0) return;

    if (!confirm(`¿Confirmar ${selectedAppointments.size} citas seleccionadas?`)) {
        return;
    }

    try {
        const promises = [];
        for (const appointmentId of selectedAppointments) {
            const apt = allAppointments.find(a => a.id === appointmentId);
            if (apt) {
                promises.push(acceptAppointmentSilent(appointmentId, apt.email, apt.name, apt.slotId, apt.slotDatetime));
            }
        }

        await Promise.all(promises);
        selectedAppointments.clear();
        await loadAllData();
        showToast(`${promises.length} citas aceptadas exitosamente`);
    } catch (error) {
        console.error('Error in bulk accept:', error);
        showToast('Error al aceptar citas: ' + error.message, 'error');
    }
};

window.bulkReject = async function() {
    if (selectedAppointments.size === 0) return;

    if (!confirm(`¿Rechazar ${selectedAppointments.size} citas seleccionadas?`)) {
        return;
    }

    try {
        const promises = [];
        for (const appointmentId of selectedAppointments) {
            const apt = allAppointments.find(a => a.id === appointmentId);
            if (apt) {
                promises.push(rejectAppointmentSilent(appointmentId, apt.email, apt.name, apt.slotId));
            }
        }

        await Promise.all(promises);
        selectedAppointments.clear();
        await loadAllData();
        showToast(`${promises.length} citas rechazadas`);
    } catch (error) {
        console.error('Error in bulk reject:', error);
        showToast('Error al rechazar citas: ' + error.message, 'error');
    }
};

// ============================================
// ACEPTAR/RECHAZAR CITAS
// ============================================

window.acceptAppointment = async (appointmentId, email, name, slotId, dateStr, timeStr) => {
    if (!confirm('¿Confirmar esta cita?')) {
        return;
    }

    try {
        await acceptAppointmentSilent(appointmentId, email, name, slotId, { dateStr, timeStr });
        await loadAllData();
        showToast('Cita aceptada exitosamente');
    } catch (error) {
        console.error('Error accepting appointment:', error);
        showToast('Error al aceptar cita: ' + error.message, 'error');
    }
};

async function acceptAppointmentSilent(appointmentId, email, name, slotId, datetimeInfo) {
    // Update appointment status
    await updateDoc(doc(db, 'appointments', appointmentId), {
        status: 'accepted',
        updatedAt: serverTimestamp()
    });

    // Mark slot as unavailable
    if (slotId) {
        await updateDoc(doc(db, 'slots', slotId), {
            available: false
        });
    }

    // Send confirmation email
    let dateStr, timeStr;
    if (typeof datetimeInfo === 'object' && datetimeInfo.dateStr) {
        dateStr = datetimeInfo.dateStr;
        timeStr = datetimeInfo.timeStr;
    } else {
        const datetime = datetimeInfo;
        dateStr = datetime.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        timeStr = datetime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
        to_email: email,
        to_name: name,
        subject: 'Cita Confirmada - Ciao Ciao',
        message: `Hola ${name},\n\n¡Tu cita ha sido confirmada!\n\nFecha: ${dateStr}\nHora: ${timeStr}\n\nTe esperamos en nuestro showroom.\n\nCiao Ciao Joyería`
    });
}

window.rejectAppointment = async (appointmentId, email, name, slotId) => {
    if (!confirm('¿Rechazar esta cita?')) {
        return;
    }

    try {
        await rejectAppointmentSilent(appointmentId, email, name, slotId);
        await loadAllData();
        showToast('Cita rechazada');
    } catch (error) {
        console.error('Error rejecting appointment:', error);
        showToast('Error al rechazar cita: ' + error.message, 'error');
    }
};

async function rejectAppointmentSilent(appointmentId, email, name, slotId) {
    // Update appointment status
    await updateDoc(doc(db, 'appointments', appointmentId), {
        status: 'rejected',
        updatedAt: serverTimestamp()
    });

    // Slot remains available (don't update)

    // Send rejection email
    await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
        to_email: email,
        to_name: name,
        subject: 'Solicitud de Cita - Ciao Ciao',
        message: `Hola ${name},\n\nLamentamos informarte que no podemos confirmar tu cita en el horario solicitado.\n\nPor favor, visita nuestra página para seleccionar otro horario disponible.\n\nCiao Ciao Joyería`
    });
}

// ============================================
// VER IDENTIFICACIÓN
// ============================================

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

// ============================================
// EXPORTACIÓN A CSV
// ============================================

function appointmentsToCSV(appointments) {
    const headers = ['Nombre', 'Email', 'Teléfono', 'Fecha', 'Hora', 'Estado', 'Notas'];
    const rows = appointments.map(apt => {
        const dateStr = apt.slotDatetime.toLocaleDateString('es-ES');
        const timeStr = apt.slotDatetime.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const statusText = apt.status === 'pending' ? 'Pendiente' : apt.status === 'accepted' ? 'Aceptada' : 'Rechazada';

        return [
            apt.name,
            apt.email,
            apt.phone,
            dateStr,
            timeStr,
            statusText,
            apt.notes || ''
        ];
    });

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    return csv;
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.exportPendingCSV = function() {
    const pending = allAppointments.filter(apt => apt.status === 'pending');
    const csv = appointmentsToCSV(pending);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `citas-pendientes-${timestamp}.csv`);
    showToast('CSV exportado exitosamente');
};

window.exportConfirmedCSV = function() {
    const confirmed = allAppointments.filter(apt => apt.status !== 'pending');
    const csv = appointmentsToCSV(confirmed);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `citas-confirmadas-${timestamp}.csv`);
    showToast('CSV exportado exitosamente');
};

window.exportAllCSV = function() {
    const csv = appointmentsToCSV(allAppointments);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `todas-las-citas-${timestamp}.csv`);
    showToast('CSV exportado exitosamente');
};

// ============================================
// INICIALIZACIÓN
// ============================================

// Set minimum date for slot picker to today
document.getElementById('slotDate').min = new Date().toISOString().split('T')[0];

// Initialize
checkAuth();
