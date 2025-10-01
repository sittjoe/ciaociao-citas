/**
 * App Principal - Sistema de Citas Ciao Ciao
 * Gestiona flujo multi-paso, validaciones y Firebase
 */

import { CalendarManager, DateUtils } from './calendar.js';
import { Validators, ValidationUtils } from './validation.js';
import { firebaseConfig, emailConfig, adminEmail } from './firebase-config.js';

// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Initialize EmailJS
emailjs.init(emailConfig.publicKey);

// ===================
// STATE MANAGEMENT
// ===================
const AppState = {
    currentStep: 1,
    selectedDate: null,
    selectedSlot: null,
    formData: {},
    uploadedFile: null,
    allSlots: [],
    slotsForSelectedDate: []
};

// ===================
// STEP MANAGER
// ===================
class StepManager {
    constructor() {
        this.steps = [1, 2, 3, 4];
        this.currentStep = 1;
    }

    goToStep(stepNum) {
        if (stepNum < 1 || stepNum > 4) return;

        // Ocultar step actual
        document.getElementById(`step${this.currentStep}`).classList.add('hidden');

        // Mostrar nuevo step
        document.getElementById(`step${stepNum}`).classList.remove('hidden');

        this.currentStep = stepNum;
        AppState.currentStep = stepNum;

        // Actualizar progress bar
        this.updateProgressBar();

        // Scroll to top suave
        document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
    }

    updateProgressBar() {
        const progressLine = document.getElementById('progressLine');
        const steps = document.querySelectorAll('.step');

        // Actualizar línea de progreso
        const progress = ((this.currentStep - 1) / 3) * 100;
        progressLine.style.width = `${progress}%`;

        // Actualizar steps
        steps.forEach((step, index) => {
            const stepNum = index + 1;
            step.classList.remove('active', 'completed');

            if (stepNum < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNum === this.currentStep) {
                step.classList.add('active');
            }
        });
    }

    canProceed(fromStep) {
        switch (fromStep) {
            case 1:
                return AppState.selectedDate !== null;
            case 2:
                return AppState.selectedSlot !== null;
            case 3:
                return this.validateStep3();
            case 4:
                return true;
            default:
                return false;
        }
    }

    validateStep3() {
        const { valid } = Validators.validateAll({
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value
        }, AppState.uploadedFile);

        return valid;
    }
}

const stepManager = new StepManager();

// ===================
// CALENDAR INTEGRATION
// ===================
let calendarManager = null;

function initCalendar() {
    const container = document.getElementById('calendarContainer');

    calendarManager = new CalendarManager(container, (selectedDate) => {
        AppState.selectedDate = selectedDate;
        document.getElementById('step1Next').disabled = false;
    });

    // Marcar días con horarios
    calendarManager.markDaysWithSlots(AppState.allSlots);
}

// ===================
// TIME SLOT MANAGER
// ===================
class TimeSlotManager {
    renderSlotsForDate(date) {
        // Filtrar slots para la fecha seleccionada
        AppState.slotsForSelectedDate = AppState.allSlots.filter(slot => {
            const slotDate = slot.datetime instanceof Date ? slot.datetime : slot.datetime.toDate();
            return DateUtils.isSameDay(slotDate, date);
        });

        const container = document.getElementById('timeSlotsContainer');
        const titleEl = document.getElementById('selectedDateTitle');

        // Actualizar título
        titleEl.textContent = `Horarios disponibles para ${DateUtils.formatLongDate(date)}`;

        if (AppState.slotsForSelectedDate.length === 0) {
            container.innerHTML = `
                <div class="empty-state-client">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" class="empty-state-icon">
                        <circle cx="40" cy="40" r="38" stroke="var(--gold-champagne)" stroke-width="2" opacity="0.2"/>
                        <path d="M25 40L35 50L55 30" stroke="var(--gold-champagne)" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
                        <circle cx="40" cy="40" r="3" fill="var(--gold-champagne)"/>
                    </svg>
                    <h4 class="empty-state-title">No hay horarios disponibles</h4>
                    <p class="empty-state-text">
                        Esta fecha no tiene horarios disponibles. Por favor, selecciona otra fecha en el calendario.
                    </p>
                </div>
            `;
            return;
        }

        // Renderizar slots
        container.innerHTML = AppState.slotsForSelectedDate.map(slot => {
            const slotDate = slot.datetime instanceof Date ? slot.datetime : slot.datetime.toDate();
            const timeStr = slotDate.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="time-slot" data-slot-id="${slot.id}">
                    ${timeStr}
                </div>
            `;
        }).join('');

        // Agregar event listeners
        document.querySelectorAll('.time-slot').forEach(el => {
            el.addEventListener('click', () => this.selectSlot(el.dataset.slotId));
        });
    }

    selectSlot(slotId) {
        AppState.selectedSlot = AppState.slotsForSelectedDate.find(s => s.id === slotId);

        // UI update
        document.querySelectorAll('.time-slot').forEach(el => {
            el.classList.remove('selected');
        });
        document.querySelector(`[data-slot-id="${slotId}"]`).classList.add('selected');

        // Habilitar botón siguiente
        document.getElementById('step2Next').disabled = false;
    }
}

const timeSlotManager = new TimeSlotManager();

// ===================
// FORM MANAGER
// ===================
class FormManager {
    setupLiveValidation() {
        // Nombre
        const nameInput = document.getElementById('name');
        nameInput.addEventListener('blur', () => {
            const result = Validators.validateName(nameInput.value);
            if (!result.valid) {
                Validators.showError('name', result.message);
            } else {
                Validators.clearError('name');
            }
            this.checkFormValidity();
        });

        nameInput.addEventListener('input', () => {
            if (nameInput.value.length > 0) {
                Validators.clearError('name');
            }
        });

        // Email
        const emailInput = document.getElementById('email');
        emailInput.addEventListener('blur', () => {
            const result = Validators.validateEmail(emailInput.value);
            if (!result.valid) {
                Validators.showError('email', result.message);
            } else {
                Validators.clearError('email');
            }
            this.checkFormValidity();
        });

        emailInput.addEventListener('input', () => {
            if (emailInput.value.length > 0) {
                Validators.clearError('email');
            }
        });

        // Teléfono con auto-formateo
        const phoneInput = document.getElementById('phone');
        phoneInput.addEventListener('input', (e) => {
            e.target.value = Validators.formatPhone(e.target.value);
            Validators.clearError('phone');
        });

        phoneInput.addEventListener('blur', () => {
            const result = Validators.validatePhone(phoneInput.value);
            if (!result.valid) {
                Validators.showError('phone', result.message);
            } else {
                Validators.clearError('phone');
            }
            this.checkFormValidity();
        });

        // Notas (opcional, sin validación)
    }

    checkFormValidity() {
        const allValid = stepManager.validateStep3();
        document.getElementById('step3Next').disabled = !allValid;
    }

    getFormData() {
        return {
            name: ValidationUtils.capitalize(ValidationUtils.sanitizeText(document.getElementById('name').value)),
            email: document.getElementById('email').value.trim().toLowerCase(),
            phone: document.getElementById('phone').value.trim(),
            notes: ValidationUtils.sanitizeText(document.getElementById('notes').value || '')
        };
    }
}

const formManager = new FormManager();

// ===================
// FILE UPLOAD MANAGER
// ===================
class FileUploadManager {
    constructor() {
        this.file = null;
    }

    init() {
        const uploadZone = document.getElementById('fileUploadZone');
        const fileInput = document.getElementById('identification');
        const removeBtn = document.getElementById('removeFile');

        // Click to select
        uploadZone.addEventListener('click', () => fileInput.click());

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // Drag & Drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');

            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // Remove file
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFile();
        });
    }

    handleFile(file) {
        const validation = Validators.validateFile(file);

        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        this.file = file;
        AppState.uploadedFile = file;
        this.showPreview(file);
        formManager.checkFormValidity();
    }

    showPreview(file) {
        const preview = document.getElementById('filePreview');
        const previewImage = document.getElementById('previewImage');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        fileName.textContent = file.name;
        fileSize.textContent = Validators.formatFileSize(file.size);

        // Preview solo para imágenes
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                previewImage.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewImage.style.display = 'none';
        }

        preview.classList.add('show');
    }

    removeFile() {
        this.file = null;
        AppState.uploadedFile = null;

        document.getElementById('identification').value = '';
        document.getElementById('filePreview').classList.remove('show');

        formManager.checkFormValidity();
    }

    async uploadToFirebase() {
        if (!this.file) throw new Error('No file selected');

        const fileName = `${Date.now()}_${this.file.name}`;
        const storageRef = ref(storage, `identifications/${fileName}`);

        const snapshot = await uploadBytes(storageRef, this.file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        return downloadURL;
    }
}

const fileUploadManager = new FileUploadManager();

// ===================
// CONFIRMATION MANAGER
// ===================
function showConfirmation() {
    const summaryContainer = document.getElementById('confirmationSummary');
    const formData = formManager.getFormData();

    const slotDate = AppState.selectedSlot.datetime instanceof Date
        ? AppState.selectedSlot.datetime
        : AppState.selectedSlot.datetime.toDate();

    const dateStr = DateUtils.formatLongDate(slotDate);
    const timeStr = slotDate.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    summaryContainer.innerHTML = `
        <div style="background: var(--gray-light); padding: 20px; border-radius: var(--radius-md); margin-bottom: 16px;">
            <h4 style="margin-bottom: 8px; color: var(--gold-champagne);">Fecha y Hora</h4>
            <p style="font-size: 1.1rem; font-weight: 600;">${dateStr}</p>
            <p style="font-size: 1.1rem; color: var(--gold-dark);">${timeStr}</p>
        </div>

        <div style="background: var(--gray-light); padding: 20px; border-radius: var(--radius-md); margin-bottom: 16px;">
            <h4 style="margin-bottom: 12px; color: var(--gold-champagne);">Tus Datos</h4>
            <p><strong>Nombre:</strong> ${formData.name}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            <p><strong>Teléfono:</strong> ${formData.phone}</p>
            ${formData.notes ? `<p><strong>Motivo:</strong> ${formData.notes}</p>` : ''}
        </div>

        <div style="background: var(--gray-light); padding: 20px; border-radius: var(--radius-md);">
            <h4 style="margin-bottom: 8px; color: var(--gold-champagne);">Identificación</h4>
            <p>${AppState.uploadedFile.name} (${Validators.formatFileSize(AppState.uploadedFile.size)})</p>
        </div>
    `;
}

// ===================
// APPOINTMENT MANAGER
// ===================
async function createAppointment() {
    try {
        // Mostrar loading
        document.getElementById('loadingOverlay').classList.remove('hidden');

        // 1. Subir archivo
        const identificationUrl = await fileUploadManager.uploadToFirebase();

        // 2. Preparar datos
        const formData = formManager.getFormData();
        const slotDate = AppState.selectedSlot.datetime instanceof Date
            ? AppState.selectedSlot.datetime
            : AppState.selectedSlot.datetime.toDate();

        const appointmentData = {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            notes: formData.notes,
            slotId: AppState.selectedSlot.id,
            slotDatetime: AppState.selectedSlot.datetime,
            identificationUrl: identificationUrl,
            status: 'pending',
            createdAt: serverTimestamp()
        };

        // 3. Guardar en Firestore
        const appointmentsRef = collection(db, 'appointments');
        const docRef = await addDoc(appointmentsRef, appointmentData);

        // 4. Enviar emails
        await sendConfirmationEmails(appointmentData, docRef.id);

        // 5. Mostrar éxito
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('successModal').classList.remove('hidden');

    } catch (error) {
        console.error('Error creating appointment:', error);
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('errorText').textContent = error.message || 'Error al procesar tu solicitud. Por favor, intenta de nuevo.';
        document.getElementById('errorModal').classList.remove('hidden');
    }
}

async function sendConfirmationEmails(appointmentData, appointmentId) {
    const slotDate = appointmentData.slotDatetime instanceof Date
        ? appointmentData.slotDatetime
        : appointmentData.slotDatetime.toDate();

    const dateStr = DateUtils.formatLongDate(slotDate);
    const timeStr = slotDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Email al cliente
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

    // Email al admin
    try {
        await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
            to_email: adminEmail,
            to_name: 'Admin',
            subject: 'Nueva Solicitud de Cita - Ciao Ciao',
            message: `Nueva solicitud:\n\nCliente: ${appointmentData.name}\nEmail: ${appointmentData.email}\nTeléfono: ${appointmentData.phone}\nFecha: ${dateStr}\nHora: ${timeStr}\nNotas: ${appointmentData.notes || 'N/A'}\n\nID: ${appointmentId}`
        });
    } catch (error) {
        console.error('Error sending admin email:', error);
    }
}

// ===================
// FIREBASE DATA LOADING
// ===================
async function loadAvailableSlots() {
    try {
        const slotsRef = collection(db, 'slots');
        const q = query(
            slotsRef,
            where('available', '==', true),
            orderBy('datetime', 'asc')
        );

        const querySnapshot = await getDocs(q);
        AppState.allSlots = [];

        const now = new Date();

        querySnapshot.forEach((doc) => {
            const slotData = doc.data();
            const slotDate = slotData.datetime.toDate();

            // Solo slots futuros
            if (slotDate > now) {
                AppState.allSlots.push({
                    id: doc.id,
                    ...slotData,
                    datetime: slotDate
                });
            }
        });

        // Inicializar calendario
        initCalendar();

        // Ocultar loading, mostrar step 1
        document.getElementById('loadingInitial').classList.add('hidden');
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('step1').classList.remove('hidden');

    } catch (error) {
        console.error('Error loading slots:', error);
        document.getElementById('loadingInitial').classList.add('hidden');
        document.getElementById('errorText').textContent = 'Error al cargar horarios disponibles. Por favor, recarga la página.';
        document.getElementById('errorModal').classList.remove('hidden');
    }
}

// ===================
// EVENT LISTENERS
// ===================
function setupEventListeners() {
    // Step 1 -> Step 2
    document.getElementById('step1Next').addEventListener('click', () => {
        if (stepManager.canProceed(1)) {
            timeSlotManager.renderSlotsForDate(AppState.selectedDate);
            stepManager.goToStep(2);
        }
    });

    // Step 2 Back
    document.getElementById('step2Back').addEventListener('click', () => {
        stepManager.goToStep(1);
    });

    // Step 2 -> Step 3
    document.getElementById('step2Next').addEventListener('click', () => {
        if (stepManager.canProceed(2)) {
            stepManager.goToStep(3);
        }
    });

    // Step 3 Back
    document.getElementById('step3Back').addEventListener('click', () => {
        stepManager.goToStep(2);
    });

    // Step 3 -> Step 4
    document.getElementById('step3Next').addEventListener('click', () => {
        if (stepManager.canProceed(3)) {
            AppState.formData = formManager.getFormData();
            showConfirmation();
            stepManager.goToStep(4);
        }
    });

    // Step 4 Back
    document.getElementById('step4Back').addEventListener('click', () => {
        stepManager.goToStep(3);
    });

    // Step 4 Confirm
    document.getElementById('step4Confirm').addEventListener('click', () => {
        createAppointment();
    });
}

// ===================
// INITIALIZATION
// ===================
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    formManager.setupLiveValidation();
    fileUploadManager.init();

    // Cargar datos de Firebase
    await loadAvailableSlots();
});
