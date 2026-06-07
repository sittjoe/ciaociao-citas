import { Timestamp } from 'firebase-admin/firestore'
import { adminDb, adminStorage } from './firebase-admin'

interface CleanupResult {
  scanned: number
  referenced: number
  orphaned: number
  deleted: number
  skippedRecent: number
  errors: string[]
}

function normalizeStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('identifications/')) return null
  return trimmed
}

async function collectReferencedIdentifications(): Promise<Set<string>> {
  const referenced = new Set<string>()

  const appts = await adminDb.collection('appointments').select('identificationUrl').get()
  for (const doc of appts.docs) {
    const path = normalizeStoragePath(doc.data().identificationUrl)
    if (path) referenced.add(path)
  }

  const guests = await adminDb.collectionGroup('guests').select('identificationUrl').get()
  for (const doc of guests.docs) {
    const path = normalizeStoragePath(doc.data().identificationUrl)
    if (path) referenced.add(path)
  }

  return referenced
}

export async function cleanupOrphanedIdentifications(options?: {
  retentionDays?: number
  dryRun?: boolean
  maxDeletes?: number
}): Promise<CleanupResult> {
  const retentionDays = options?.retentionDays ?? Number(process.env.ID_ORPHAN_RETENTION_DAYS ?? 14)
  const dryRun = options?.dryRun ?? process.env.ID_ORPHAN_CLEANUP_DRY_RUN === 'true'
  const maxDeletes = options?.maxDeletes ?? 50
  const cutoffMs = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000

  const referenced = await collectReferencedIdentifications()
  const [files] = await adminStorage.bucket().getFiles({ prefix: 'identifications/' })

  const result: CleanupResult = {
    scanned: files.length,
    referenced: referenced.size,
    orphaned: 0,
    deleted: 0,
    skippedRecent: 0,
    errors: [],
  }

  for (const file of files) {
    if (referenced.has(file.name)) continue

    result.orphaned++
    if (result.deleted >= maxDeletes) continue

    try {
      const [metadata] = await file.getMetadata()
      const createdMs = metadata.timeCreated ? new Date(metadata.timeCreated).getTime() : 0
      if (!createdMs || createdMs > cutoffMs) {
        result.skippedRecent++
        continue
      }

      if (!dryRun) await file.delete()
      result.deleted++
    } catch (err) {
      result.errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await adminDb.collection('maintenanceRuns').add({
    type: 'orphaned_identifications_cleanup',
    ...result,
    dryRun,
    retentionDays,
    maxDeletes,
    createdAt: Timestamp.now(),
  }).catch(err => {
    console.error('Unable to record ID cleanup run:', err)
  })

  return result
}
