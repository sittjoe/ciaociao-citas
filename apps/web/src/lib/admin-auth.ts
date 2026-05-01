import { cookies } from 'next/headers'
import { adminAuth, adminDb } from './firebase-admin'
import { getSession, type AdminSession } from './admin-session'

export interface AdminUser {
  uid: string
  email: string
  displayName?: string
  active: boolean
  createdAt?: Date
  updatedAt?: Date
}

function normalizeEmail(email: string | undefined | null): string {
  return String(email ?? '').trim().toLowerCase()
}

export function getBootstrapAdminEmails(): string[] {
  return Array.from(new Set(
    (process.env.ADMIN_BOOTSTRAP_EMAILS ?? process.env.ADMIN_EMAIL ?? '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean)
  ))
}

export async function isAdminUser(uid: string, email: string | undefined | null): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email)
  const doc = await adminDb.collection('admins').doc(uid).get()
  if (doc.exists) {
    const data = doc.data()!
    return data.active === true && normalizeEmail(data.email) === normalizedEmail
  }

  return normalizedEmail.length > 0 && getBootstrapAdminEmails().includes(normalizedEmail)
}

export async function requireAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get('__session')?.value
  const session = getSession(token)
  if (!session) return null

  const active = await isAdminUser(session.uid, session.email)
  return active ? session : null
}

export async function listAdmins(): Promise<AdminUser[]> {
  const snap = await adminDb.collection('admins').orderBy('email').get()
  return snap.docs.map(doc => {
    const data = doc.data()
    return {
      uid: doc.id,
      email: normalizeEmail(data.email),
      displayName: data.displayName,
      active: data.active === true,
      createdAt: data.createdAt?.toDate?.(),
      updatedAt: data.updatedAt?.toDate?.(),
    }
  })
}

export async function upsertAdminByEmail(email: string, actor?: AdminSession): Promise<AdminUser> {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) throw new Error('EMAIL_REQUIRED')

  const user = await adminAuth.getUserByEmail(normalizedEmail)
  await adminDb.collection('admins').doc(user.uid).set({
    email: normalizedEmail,
    displayName: user.displayName ?? '',
    active: true,
    createdBy: actor?.email ?? 'system',
    updatedAt: new Date(),
    createdAt: new Date(),
  }, { merge: true })

  return {
    uid: user.uid,
    email: normalizedEmail,
    displayName: user.displayName ?? '',
    active: true,
  }
}

export async function deactivateAdmin(uid: string, actor?: AdminSession): Promise<void> {
  await adminDb.collection('admins').doc(uid).set({
    active: false,
    deactivatedBy: actor?.email ?? 'system',
    updatedAt: new Date(),
  }, { merge: true })
}
