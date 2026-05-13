/**
 * Módulo de Validaciones Robustas
 * Sistema de citas Ciao Ciao Joyería
 */

export const Validators = {
    /**
     * Valida nombre completo
     * @param {string} name - Nombre a validar
     * @returns {Object} { valid: boolean, message: string }
     */
    validateName(name) {
        if (!name || name.trim().length === 0) {
            return {
                valid: false,
                message: 'El nombre es requerido'
            };
        }

        const trimmed = name.trim();

        if (trimmed.length < 3) {
            return {
                valid: false,
                message: 'El nombre debe tener al menos 3 caracteres'
            };
        }

        // Rechazar nombres compuestos solo por espacios o guiones (ej: "---", "   ")
        if (trimmed.replace(/[\s-]/g, '').length < 2) {
            return {
                valid: false,
                message: 'El nombre debe tener al menos 2 letras'
            };
        }

        // Solo letras, espacios, acentos y guiones
        const nameRegex = /^[a-záéíóúñü\s-]+$/i;
        if (!nameRegex.test(trimmed)) {
            return {
                valid: false,
                message: 'El nombre solo puede contener letras'
            };
        }

        return {
            valid: true,
            message: ''
        };
    },

    /**
     * Valida email con RFC 5322
     * @param {string} email - Email a validar
     * @returns {Object} { valid: boolean, message: string }
     */
    validateEmail(email) {
        if (!email || email.trim().length === 0) {
            return {
                valid: false,
                message: 'El email es requerido'
            };
        }

        // RFC 5322 simplified regex
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        if (!emailRegex.test(email.trim())) {
            return {
                valid: false,
                message: 'Ingresa un email válido (ej: nombre@ejemplo.com)'
            };
        }

        return {
            valid: true,
            message: ''
        };
    },

    /**
     * Valida teléfono mexicano
     * @param {string} phone - Teléfono a validar
     * @returns {Object} { valid: boolean, message: string }
     */
    validatePhone(phone) {
        if (!phone || phone.trim().length === 0) {
            return {
                valid: false,
                message: 'El teléfono es requerido'
            };
        }

        // Extraer solo dígitos para validar longitud exacta
        const digits = phone.replace(/\D/g, '');

        if (digits.length === 10) {
            return {
                valid: true,
                message: '',
                phone: digits
            };
        }

        if (digits.length === 12 && digits.startsWith('52')) {
            return {
                valid: true,
                message: '',
                phone: digits.slice(2)
            };
        }

        return {
            valid: false,
            message: 'Debe tener 10 dígitos (formato: +52 XXX XXX XXXX o 10 dígitos)'
        };
    },

    /**
     * Formatea teléfono mientras el usuario escribe
     * @param {string} phone - Teléfono a formatear
     * @returns {string} - Teléfono formateado
     */
    formatPhone(phone) {
        // Detectar si el usuario incluyó prefijo internacional explícito (+52)
        // para preservarlo en el output formateado.
        const hasPlus52 = /^\s*\+\s*52\b/.test(phone) || /^\s*\+52/.test(phone);

        // Remover todo excepto dígitos y +
        let cleaned = phone.replace(/[^\d+]/g, '');

        // Si empieza con +52
        if (cleaned.startsWith('+52')) {
            cleaned = cleaned.substring(3);
        } else if (cleaned.startsWith('52') && hasPlus52) {
            cleaned = cleaned.substring(2);
        }

        // Limitar a 10 dígitos
        cleaned = cleaned.substring(0, 10);

        // Formatear: XXX XXX XXXX
        let formatted;
        if (cleaned.length <= 3) {
            formatted = cleaned;
        } else if (cleaned.length <= 6) {
            formatted = `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
        } else {
            formatted = `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
        }

        // Si el input crudo traía +52, conservarlo en el output formateado
        if (hasPlus52 && formatted.length > 0) {
            return `+52 ${formatted}`;
        }
        return formatted;
    },

    /**
     * Valida archivo de identificación
     * @param {File} file - Archivo a validar
     * @returns {Object} { valid: boolean, message: string }
     */
    validateFile(file) {
        if (!file) {
            return {
                valid: false,
                message: 'Debes adjuntar tu identificación'
            };
        }

        // Validar tamaño (5MB máximo)
        const maxSize = 5 * 1024 * 1024; // 5MB en bytes
        if (file.size > maxSize) {
            return {
                valid: false,
                message: 'El archivo es muy grande. Máximo 5MB'
            };
        }

        // Validar tipo de archivo
        const allowedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/pdf'
        ];

        if (!allowedTypes.includes(file.type)) {
            return {
                valid: false,
                message: 'Formato no permitido. Usa JPG, PNG o PDF'
            };
        }

        // Validar extensión
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!allowedExtensions.includes(fileExtension)) {
            return {
                valid: false,
                message: 'Extensión no permitida. Usa .jpg, .png o .pdf'
            };
        }

        return {
            valid: true,
            message: ''
        };
    },

    /**
     * Verifica los magic bytes del archivo para asegurar que el contenido real
     * coincide con el tipo MIME declarado (evita renombrar .exe → .jpg).
     * Async porque lee los primeros bytes vía File.slice().arrayBuffer().
     * @param {File} file
     * @returns {Promise<Object>} { valid: boolean, message: string, detectedType?: string }
     */
    async validateFileMagicBytes(file) {
        if (!file) {
            return { valid: false, message: 'Debes adjuntar tu identificación' };
        }

        let buf;
        try {
            buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        } catch (err) {
            return { valid: false, message: 'No se pudo leer el archivo' };
        }

        if (buf.length < 4) {
            return { valid: false, message: 'Archivo demasiado pequeño o corrupto' };
        }

        // JPEG: FF D8 FF
        const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
        // PNG: 89 50 4E 47
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        // PDF: 25 50 44 46  (%PDF)
        const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
        // WebP: "RIFF"....."WEBP"
        const isWebp = buf.length >= 12 &&
            buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
            buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;

        const mime = (file.type || '').toLowerCase();
        const declaredImage = mime.startsWith('image/');
        const declaredPdf = mime === 'application/pdf';

        if (declaredPdf && !isPdf) {
            return { valid: false, message: 'Tipo de archivo no válido' };
        }

        if (declaredImage && !(isJpeg || isPng || isWebp)) {
            return { valid: false, message: 'Tipo de archivo no válido' };
        }

        // Si el MIME no estaba en las categorías esperadas, exigir que al menos
        // los magic bytes correspondan a un formato permitido.
        if (!declaredImage && !declaredPdf && !(isJpeg || isPng || isPdf || isWebp)) {
            return { valid: false, message: 'Tipo de archivo no válido' };
        }

        let detectedType = null;
        if (isJpeg) detectedType = 'jpeg';
        else if (isPng) detectedType = 'png';
        else if (isPdf) detectedType = 'pdf';
        else if (isWebp) detectedType = 'webp';

        return { valid: true, message: '', detectedType };
    },

    /**
     * Formatea tamaño de archivo para mostrar
     * @param {number} bytes - Tamaño en bytes
     * @returns {string} - Tamaño formateado
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Muestra error en un campo
     * @param {string} fieldId - ID del campo
     * @param {string} message - Mensaje de error
     */
    showError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Agregar clase de error al input
        field.classList.add('error');

        // Buscar o crear elemento de error
        let errorEl = field.parentElement.querySelector('.form-error');

        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'form-error';
            field.parentElement.appendChild(errorEl);
        }

        errorEl.textContent = message;
        errorEl.classList.add('show');
    },

    /**
     * Limpia error de un campo
     * @param {string} fieldId - ID del campo
     */
    clearError(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Remover clase de error
        field.classList.remove('error');

        // Ocultar mensaje de error
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.classList.remove('show');
        }
    },

    /**
     * Valida todos los campos del formulario
     * @param {Object} formData - Datos del formulario
     * @param {File} file - Archivo de identificación
     * @returns {Object} { valid: boolean, errors: Object }
     */
    validateAll(formData, file) {
        const errors = {};
        let isValid = true;

        // Validar nombre
        const nameValidation = this.validateName(formData.name);
        if (!nameValidation.valid) {
            errors.name = nameValidation.message;
            isValid = false;
        }

        // Validar email
        const emailValidation = this.validateEmail(formData.email);
        if (!emailValidation.valid) {
            errors.email = emailValidation.message;
            isValid = false;
        }

        // Validar teléfono
        const phoneValidation = this.validatePhone(formData.phone);
        if (!phoneValidation.valid) {
            errors.phone = phoneValidation.message;
            isValid = false;
        }

        // Validar archivo
        const fileValidation = this.validateFile(file);
        if (!fileValidation.valid) {
            errors.identification = fileValidation.message;
            isValid = false;
        }

        return {
            valid: isValid,
            errors: errors
        };
    }
};

// Utilidades adicionales
export const ValidationUtils = {
    /**
     * Sanitiza input de texto
     * @param {string} text - Texto a sanitizar
     * @returns {string} - Texto sanitizado
     */
    sanitizeText(text) {
        return text
            .trim()
            .replace(/\s+/g, ' ') // Múltiples espacios → un espacio
            .replace(/<[^>]*>/g, ''); // Remover HTML tags
    },

    /**
     * Capitaliza primera letra de cada palabra
     * @param {string} text - Texto a capitalizar
     * @returns {string} - Texto capitalizado
     */
    capitalize(text) {
        return text
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
};
