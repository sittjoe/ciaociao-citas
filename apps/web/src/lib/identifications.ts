const ALLOWED_PREFIX = 'identifications/'
const ALLOWED_URL_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
])

export type FileKind = 'jpeg' | 'png' | 'pdf' | 'webp'

export interface MagicByteResult {
  ok: boolean
  kind?: FileKind
  error?: string
}

// MIME types accepted for identification uploads, mapped to their magic-byte signature.
const MIME_KIND_MAP: Record<string, FileKind> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function detectKind(buf: Uint8Array): FileKind | null {
  if (buf.length < 4) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  // PDF: 25 50 44 46  (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf'
  // WebP: "RIFF"....."WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp'
  return null
}

/**
 * Validates that an uploaded file's first bytes correspond to the declared MIME type.
 * Defends against MIME spoofing / extension renaming attacks where a script.js
 * is renamed to photo.jpg.
 */
export function validateFileMagicBytes(buffer: Uint8Array, declaredMime: string): MagicByteResult {
  const expected = MIME_KIND_MAP[declaredMime.toLowerCase()]
  if (!expected) {
    return { ok: false, error: `Tipo de archivo no permitido: ${declaredMime}` }
  }
  const detected = detectKind(buffer)
  if (!detected) {
    return { ok: false, error: 'No se pudo determinar el tipo real del archivo' }
  }
  if (detected !== expected) {
    return {
      ok: false,
      kind: detected,
      error: `El contenido no coincide con el tipo declarado (esperado ${expected}, recibido ${detected})`,
    }
  }
  return { ok: true, kind: detected }
}

function isSafeIdentificationPath(path: string): boolean {
  if (!path.startsWith(ALLOWED_PREFIX)) return false
  if (path.includes('\0')) return false
  return !path.split('/').some(part => part === '..' || part === '')
}

function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value).replace(/^\/+/, '')
  } catch {
    return null
  }
}

export function normalizeIdentificationPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const directPath = decodePath(trimmed)
  if (directPath && isSafeIdentificationPath(directPath)) return directPath

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || !ALLOWED_URL_HOSTS.has(url.hostname)) return null

  if (url.hostname === 'firebasestorage.googleapis.com') {
    const marker = '/o/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    const encodedObjectPath = url.pathname.slice(markerIndex + marker.length)
    const objectPath = decodePath(encodedObjectPath)
    return objectPath && isSafeIdentificationPath(objectPath) ? objectPath : null
  }

  const storagePath = decodePath(url.pathname)
  if (!storagePath) return null
  const [, ...objectParts] = storagePath.split('/')
  const objectPath = objectParts.join('/')
  return isSafeIdentificationPath(objectPath) ? objectPath : null
}
