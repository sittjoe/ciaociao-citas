const ALLOWED_PREFIX = 'identifications/'
const ALLOWED_URL_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
])

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
