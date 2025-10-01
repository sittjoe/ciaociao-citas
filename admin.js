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
        showEmptyState(container, 'no-slots');
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
    const confirmed = await showConfirmModal(
        '¿Eliminar horario?',
        'Esta acción no se puede deshacer. El horario será eliminado permanentemente.',
        null,
        'danger'
    );

    if (!confirmed) return;

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
// SKELETON LOADERS
// ============================================

function showSkeletonStats() {
    const statsGrid = document.querySelector('.stats-grid');
    if (!statsGrid) return;

    statsGrid.innerHTML = Array(4).fill('').map(() => `
        <div class="skeleton-stat-card">
            <div class="skeleton skeleton-icon"></div>
            <div style="flex: 1;">
                <div class="skeleton skeleton-stat-value"></div>
                <div class="skeleton skeleton-stat-label"></div>
            </div>
        </div>
    `).join('');
}

function showSkeletonAppointments(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Array(count).fill('').map(() => `
        <div class="skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex: 1;">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                </div>
            </div>
            <div class="skeleton skeleton-text-full"></div>
            <div class="skeleton skeleton-text-full"></div>
            <div class="skeleton skeleton-text" style="width: 50%;"></div>
            <div class="skeleton-actions">
                <div class="skeleton skeleton-button"></div>
                <div class="skeleton skeleton-button"></div>
                <div class="skeleton skeleton-button"></div>
            </div>
        </div>
    `).join('');
}

function showSkeletonSlots() {
    const container = document.getElementById('slotsList');
    if (!container) return;

    container.innerHTML = Array(5).fill('').map(() => `
        <div class="skeleton-card" style="padding: var(--spacing-md);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <div class="skeleton skeleton-title" style="width: 40%;"></div>
                    <div class="skeleton skeleton-text" style="width: 30%; margin-top: 8px;"></div>
                </div>
                <div class="skeleton skeleton-button" style="width: 80px; height: 36px;"></div>
            </div>
        </div>
    `).join('');
}

// ============================================
// EMPTY STATES
// ============================================

function showEmptyState(container, type) {
    const emptyStates = {
        'no-pending': {
            svg: `<svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#C9A55A" stroke-width="1.5" opacity="0.3"/>
                <path d="M12 8V12L15 15" stroke="#C9A55A" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M16 2L20 6M20 6L16 10M20 6H12" stroke="#66BB6A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            title: '¡Todo al día!',
            message: 'No hay citas pendientes de aprobación en este momento.'
        },
        'no-confirmed': {
            svg: `<svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="#C9A55A" stroke-width="1.5" opacity="0.3"/>
                <line x1="8" y1="2" x2="8" y2="6" stroke="#C9A55A" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="16" y1="2" x2="16" y2="6" stroke="#C9A55A" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="3" y1="10" x2="21" y2="10" stroke="#C9A55A" stroke-width="1.5"/>
            </svg>`,
            title: 'Sin citas confirmadas',
            message: 'Aún no hay citas aceptadas o rechazadas en el sistema.'
        },
        'no-slots': {
            svg: `<svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#C9A55A" stroke-width="1.5" opacity="0.3"/>
                <path d="M12 7V12H17" stroke="#C9A55A" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M8 4L12 2L16 4" stroke="#FFA726" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            title: 'No hay horarios disponibles',
            message: 'Comienza agregando tu primer horario disponible.',
            action: `<button class="action-btn" onclick="document.getElementById('slotDate').focus()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Agregar Horario
            </button>`
        },
        'no-results': {
            svg: `<svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="#C9A55A" stroke-width="1.5"/>
                <path d="M21 21L16.65 16.65" stroke="#C9A55A" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="7" y1="11" x2="15" y2="11" stroke="#EF5350" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`,
            title: 'No se encontraron resultados',
            message: 'Intenta ajustar los filtros o buscar con otros términos.'
        },
        'no-upcoming': {
            svg: `<svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="15" rx="2" stroke="#C9A55A" stroke-width="1.5" opacity="0.3"/>
                <path d="M8 4V8M16 4V8" stroke="#C9A55A" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="12" cy="14" r="2" fill="#66BB6A" opacity="0.5"/>
            </svg>`,
            title: 'Sin próximas citas',
            message: 'No hay citas confirmadas próximas para mostrar.'
        }
    };

    const state = emptyStates[type] || emptyStates['no-results'];

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">${state.svg}</div>
            <h3 class="empty-state-title">${state.title}</h3>
            <p class="empty-state-message">${state.message}</p>
            ${state.action || ''}
        </div>
    `;
}

// ============================================
// AVATAR GENERATOR
// ============================================

function generateAvatar(name) {
    const words = name.trim().split(' ');
    const initials = words.length >= 2
        ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
        : words[0].slice(0, 2).toUpperCase();

    // 6 color variations based on first letter
    const colors = [
        { bg: 'linear-gradient(135deg, #C9A55A, #A88B49)', text: '#FFF' }, // Gold
        { bg: 'linear-gradient(135deg, #66BB6A, #43A047)', text: '#FFF' }, // Green
        { bg: 'linear-gradient(135deg, #42A5F5, #1E88E5)', text: '#FFF' }, // Blue
        { bg: 'linear-gradient(135deg, #AB47BC, #8E24AA)', text: '#FFF' }, // Purple
        { bg: 'linear-gradient(135deg, #FF7043, #F4511E)', text: '#FFF' }, // Orange
        { bg: 'linear-gradient(135deg, #EC407A, #D81B60)', text: '#FFF' }  // Pink
    ];

    const colorIndex = name.charCodeAt(0) % colors.length;
    const color = colors[colorIndex];

    return `
        <div class="appointment-avatar" style="background: ${color.bg}; color: ${color.text};">
            ${initials}
        </div>
    `;
}

function getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } else if (days > 0) {
        return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
    } else if (hours > 0) {
        return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    } else if (minutes > 0) {
        return `Hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    } else {
        return 'Hace un momento';
    }
}

// ============================================
// CONFIRMATION MODAL
// ============================================

function showConfirmModal(title, message, onConfirm, type = 'warning') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const modalIcon = document.getElementById('modalIcon');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const confirmBtn = document.getElementById('modalConfirm');
        const cancelBtn = document.getElementById('modalCancel');

        // Set content
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        // Set icon based on type
        const icons = {
            warning: `<svg viewBox="0 0 24 24" fill="none">
                <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            danger: `<svg viewBox="0 0 24 24" fill="none">
                <path d="M12 9V13M12 17H12.01M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 8L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            success: `<svg viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
        };

        modalIcon.innerHTML = icons[type];
        modalIcon.className = `modal-icon ${type}`;
        confirmBtn.className = type === 'danger' ? 'btn-confirm danger' : 'btn-confirm';

        // Show modal
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Handle confirm
        const handleConfirm = () => {
            cleanup();
            if (onConfirm) onConfirm();
            resolve(true);
        };

        // Handle cancel
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        // Handle backdrop click
        const handleBackdrop = (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                handleCancel();
            }
        };

        // Handle Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };

        // Cleanup function
        const cleanup = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
            document.removeEventListener('keydown', handleEscape);
        };

        // Attach event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
        document.addEventListener('keydown', handleEscape);
    });
}

// ============================================
// GESTIÓN DE CITAS
// ============================================

async function loadAllData() {
    // Show skeletons
    showSkeletonStats();
    showSkeletonAppointments('pendingAppointments');
    showSkeletonAppointments('confirmedAppointments');
    showSkeletonAppointments('upcomingAppointments', 5);
    showSkeletonSlots();

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
        showEmptyState(container, 'no-upcoming');
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
        const hasFilters = searchTerm || dateFrom || dateTo;
        showEmptyState(container, hasFilters ? 'no-results' : 'no-pending');
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
        const timeAgo = apt.createdAt ? getRelativeTime(apt.createdAt.toDate()) : '';

        return `
            <div class="appointment-card ${isSelected ? 'selected' : ''}">
                <input type="checkbox" class="appointment-checkbox"
                       data-id="${apt.id}"
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleAppointmentSelection('${apt.id}')">
                <div class="appointment-header">
                    <div class="appointment-header-left">
                        ${generateAvatar(apt.name)}
                        <div class="appointment-header-info">
                            <h3>${apt.name}</h3>
                            <p style="color: var(--text-light);">${dateStr} - ${timeStr}</p>
                            ${timeAgo ? `<p class="appointment-time-ago">${timeAgo}</p>` : ''}
                        </div>
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
        const hasFilters = searchTerm || statusFilter || dateFrom || dateTo;
        showEmptyState(container, hasFilters ? 'no-results' : 'no-confirmed');
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
        const timeAgo = apt.updatedAt ? getRelativeTime(apt.updatedAt.toDate()) : '';

        return `
            <div class="appointment-card ${cardClass}">
                <div class="appointment-header">
                    <div class="appointment-header-left">
                        ${generateAvatar(apt.name)}
                        <div class="appointment-header-info">
                            <h3>${apt.name}</h3>
                            <p style="color: var(--text-light);">${dateStr} - ${timeStr}</p>
                            ${timeAgo ? `<p class="appointment-time-ago">${statusText} ${timeAgo.toLowerCase()}</p>` : ''}
                        </div>
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

    const confirmed = await showConfirmModal(
        'Aceptar citas seleccionadas',
        `¿Confirmar ${selectedAppointments.size} citas seleccionadas? Se enviarán emails de confirmación.`,
        null,
        'success'
    );

    if (!confirmed) return;

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

    const confirmed = await showConfirmModal(
        'Rechazar citas seleccionadas',
        `¿Rechazar ${selectedAppointments.size} citas seleccionadas? Esta acción no se puede deshacer.`,
        null,
        'danger'
    );

    if (!confirmed) return;

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
    const confirmed = await showConfirmModal(
        'Aceptar cita',
        `¿Confirmar cita de ${name}? Se enviará un email de confirmación.`,
        null,
        'success'
    );

    if (!confirmed) return;

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
    const confirmed = await showConfirmModal(
        'Rechazar cita',
        `¿Rechazar cita de ${name}? El horario quedará disponible nuevamente.`,
        null,
        'danger'
    );

    if (!confirmed) return;

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
