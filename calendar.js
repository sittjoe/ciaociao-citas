/**
 * Calendar Manager - Calendario Mensual Interactivo
 * Sistema de citas Ciao Ciao Joyería
 */

export class CalendarManager {
    constructor(containerEl, onDateSelect) {
        this.container = containerEl;
        this.onDateSelect = onDateSelect;
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.selectedDate = null;
        this.daysWithSlots = new Set(); // Set de fechas con horarios disponibles
        this.handleContainerClick = this.handleContainerClick.bind(this);
        this.handleContainerKeydown = this.handleContainerKeydown.bind(this);

        this.monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        this.dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

        this.init();
    }

    /**
     * Inicializa el calendario
     */
    init() {
        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Renderiza el calendario completo
     */
    renderCalendar() {
        const calendarHTML = `
            <div class="calendar-wrapper">
                <div class="calendar-header">
                    <h3 class="calendar-month">${this.monthNames[this.currentMonth]} ${this.currentYear}</h3>
                    <div class="calendar-nav">
                        <button type="button" class="calendar-nav-btn" id="prevMonth" aria-label="Mes anterior">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button type="button" class="calendar-nav-btn" id="nextMonth" aria-label="Mes siguiente">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="calendar-grid">
                    ${this.renderDayLabels()}
                    ${this.renderDays()}
                </div>
            </div>
        `;

        this.container.innerHTML = calendarHTML;
    }

    /**
     * Renderiza las etiquetas de los días de la semana
     */
    renderDayLabels() {
        return this.dayNames
            .map(day => `<div class="calendar-day-label">${day}</div>`)
            .join('');
    }

    /**
     * Renderiza los días del mes
     */
    renderDays() {
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        let daysHTML = '';

        // Días vacíos al inicio
        for (let i = 0; i < startingDayOfWeek; i++) {
            daysHTML += '<div class="calendar-day disabled"></div>';
        }

        // Días del mes
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(this.currentYear, this.currentMonth, day);
            currentDate.setHours(0, 0, 0, 0);

            const isPast = currentDate < today;
            const isSelected = this.selectedDate &&
                              this.selectedDate.getDate() === day &&
                              this.selectedDate.getMonth() === this.currentMonth &&
                              this.selectedDate.getFullYear() === this.currentYear;

            const dateKey = this.getDateKey(currentDate);
            const hasSlots = this.daysWithSlots.has(dateKey);

            let classes = ['calendar-day'];
            if (isPast) classes.push('disabled');
            if (isSelected) classes.push('selected');
            if (hasSlots && !isPast) classes.push('has-slots');

            daysHTML += `
                <div
                    class="${classes.join(' ')}"
                    data-date="${this.getDateKey(currentDate)}"
                    ${isPast ? '' : `role="button" tabindex="0"`}
                >
                    ${day}
                </div>
            `;
        }

        return daysHTML;
    }

    /**
     * Adjunta event listeners
     */
    attachEventListeners() {
        // Navegación de meses
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevMonth());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextMonth());
        }

        // Click en días
        this.container.removeEventListener('click', this.handleContainerClick);
        this.container.addEventListener('click', this.handleContainerClick);

        // Soporte para teclado
        this.container.removeEventListener('keydown', this.handleContainerKeydown);
        this.container.addEventListener('keydown', this.handleContainerKeydown);
    }

    handleContainerClick(e) {
        const dayEl = e.target.closest('.calendar-day');
        if (dayEl && !dayEl.classList.contains('disabled')) {
            const dateKey = dayEl.dataset.date;
            if (dateKey) {
                this.selectDate(this.parseDateKey(dateKey));
            }
        }
    }

    handleContainerKeydown(e) {
        const dayEl = e.target.closest('.calendar-day');
        if (dayEl && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            if (!dayEl.classList.contains('disabled')) {
                const dateKey = dayEl.dataset.date;
                if (dateKey) {
                    this.selectDate(this.parseDateKey(dateKey));
                }
            }
        }
    }

    /**
     * Avanza al mes siguiente
     */
    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Retrocede al mes anterior
     */
    prevMonth() {
        // No permitir ir a meses pasados
        const today = new Date();
        const minMonth = today.getMonth();
        const minYear = today.getFullYear();

        if (this.currentYear < minYear ||
            (this.currentYear === minYear && this.currentMonth <= minMonth)) {
            return; // No permitir retroceder más
        }

        this.currentMonth--;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Selecciona una fecha
     * @param {Date} date - Fecha a seleccionar
     */
    selectDate(date) {
        this.selectedDate = date;
        this.renderCalendar();
        this.attachEventListeners();

        // Callback al componente padre
        if (this.onDateSelect && typeof this.onDateSelect === 'function') {
            this.onDateSelect(date);
        }
    }

    /**
     * Marca días que tienen horarios disponibles
     * @param {Array} slotsData - Array de slots con fechas
     */
    markDaysWithSlots(slotsData) {
        this.daysWithSlots.clear();

        slotsData.forEach(slot => {
            const slotDate = slot.datetime instanceof Date ? slot.datetime : slot.datetime.toDate();
            const dateKey = this.getDateKey(slotDate);
            this.daysWithSlots.add(dateKey);
        });

        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Obtiene una clave única para una fecha (YYYY-MM-DD)
     * @param {Date} date - Fecha
     * @returns {string} - Clave de fecha
     */
    getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Parsea una clave de fecha (YYYY-MM-DD) a Date en horario local
     * @param {string} dateKey
     * @returns {Date}
     */
    parseDateKey(dateKey) {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    /**
     * Obtiene la fecha seleccionada
     * @returns {Date|null} - Fecha seleccionada
     */
    getSelectedDate() {
        return this.selectedDate;
    }

    /**
     * Limpia la selección
     */
    clearSelection() {
        this.selectedDate = null;
        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Va a un mes/año específico
     * @param {number} month - Mes (0-11)
     * @param {number} year - Año
     */
    goToMonth(month, year) {
        this.currentMonth = month;
        this.currentYear = year;
        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Va al mes actual
     */
    goToToday() {
        const today = new Date();
        this.currentMonth = today.getMonth();
        this.currentYear = today.getFullYear();
        this.renderCalendar();
        this.attachEventListeners();
    }

    /**
     * Obtiene el mes y año actual del calendario
     * @returns {Object} - { month, year }
     */
    getCurrentMonthYear() {
        return {
            month: this.currentMonth,
            year: this.currentYear
        };
    }

    /**
     * Verifica si una fecha tiene slots disponibles
     * @param {Date} date - Fecha a verificar
     * @returns {boolean} - true si tiene slots
     */
    hasSlots(date) {
        const dateKey = this.getDateKey(date);
        return this.daysWithSlots.has(dateKey);
    }

    /**
     * Destruye el calendario y limpia event listeners
     */
    destroy() {
        this.container.innerHTML = '';
        this.selectedDate = null;
        this.daysWithSlots.clear();
    }
}

/**
 * Utilidades de fecha
 */
export const DateUtils = {
    /**
     * Compara dos fechas (solo día, mes, año)
     * @param {Date} date1
     * @param {Date} date2
     * @returns {boolean} - true si son el mismo día
     */
    isSameDay(date1, date2) {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    },

    /**
     * Formatea fecha a texto legible
     * @param {Date} date
     * @returns {string} - Ej: "Lunes 15 de Octubre, 2025"
     */
    formatLongDate(date) {
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        return date.toLocaleDateString('es-ES', options);
    },

    /**
     * Formatea fecha a texto corto
     * @param {Date} date
     * @returns {string} - Ej: "15/10/2025"
     */
    formatShortDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    },

    /**
     * Verifica si una fecha es hoy
     * @param {Date} date
     * @returns {boolean}
     */
    isToday(date) {
        const today = new Date();
        return this.isSameDay(date, today);
    },

    /**
     * Verifica si una fecha es en el futuro
     * @param {Date} date
     * @returns {boolean}
     */
    isFuture(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);
        return compareDate > today;
    }
};
