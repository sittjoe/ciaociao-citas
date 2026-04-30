import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage, type Storage } from 'firebase-admin/storage'
import { getAuth, type Auth } from 'firebase-admin/auth'

let _app: App | undefined

function app(): App {
  if (_app) return _app
  const existing = getApps()
  if (existing.length > 0) return (_app = existing[0])

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  return (_app = initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey,
    }),
    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
  }))
}

// Lazy proxies: delay Firebase initialization until first actual use.
// The `bind` ensures `this` is the real instance, not the proxy.
function lazyProxy<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_, prop) {
      const instance = factory()
      const value = (instance as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value
    },
  })
}

export const adminDb:      Firestore = lazyProxy(() => getFirestore(app()))
export const adminStorage: Storage   = lazyProxy(() => getStorage(app()))
export const adminAuth:    Auth      = lazyProxy(() => getAuth(app()))
