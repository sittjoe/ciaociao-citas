/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Firestore en memoria para pruebas: lo justo para las rutas/libs de envíos
 * (colecciones, subcolecciones, where/limit/orderBy, transacciones y los
 * FieldValue que usamos). Nada toca Firestore real.
 *
 * Uso en una prueba:
 *   vi.mock('firebase-admin/firestore', async () => (await import('@/test/fake-firestore')).firestoreModule())
 *   vi.mock('./firebase-admin', async () => ({ adminDb: (await import('@/test/fake-firestore')).fakeDb }))
 */
// Se importa del paquete base (no de firebase-admin/firestore) porque las
// pruebas mockean firebase-admin/firestore con este mismo archivo.
import { Timestamp as RealTimestamp } from '@google-cloud/firestore'

type Data = Record<string, any>

class Sentinel {
  constructor(readonly kind: 'serverTimestamp' | 'delete' | 'increment', readonly operand = 0) {}
}

export const FakeFieldValue = {
  serverTimestamp: () => new Sentinel('serverTimestamp'),
  delete: () => new Sentinel('delete'),
  increment: (n: number) => new Sentinel('increment', n),
}

export function firestoreModule() {
  return { Timestamp: RealTimestamp, FieldValue: FakeFieldValue }
}

const store = new Map<string, Data>()
// Versión por documento: las transacciones se reintentan si algo que leyeron
// cambió antes de confirmar (como la concurrencia optimista real).
const versions = new Map<string, number>()
const bump = (path: string) => versions.set(path, (versions.get(path) ?? 0) + 1)

function applyWrite(path: string, data: Data, merge: boolean) {
  const base: Data = merge ? { ...(store.get(path) ?? {}) } : {}
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Sentinel) {
      if (v.kind === 'delete') delete base[k]
      else if (v.kind === 'serverTimestamp') base[k] = RealTimestamp.now()
      else base[k] = Number(base[k] ?? 0) + v.operand
    } else {
      base[k] = v
    }
  }
  store.set(path, base)
  bump(path)
}

class AlreadyExists extends Error {
  code = 6
}

function cmpVal(v: any): any {
  return v instanceof RealTimestamp ? v.toMillis() : v
}

function matches(doc: Data, field: string, op: string, value: any): boolean {
  const a = cmpVal(doc[field])
  const b = cmpVal(value)
  switch (op) {
    case '==': return a === b
    case '!=': return a !== b
    case '<': return a !== undefined && a < b
    case '<=': return a !== undefined && a <= b
    case '>': return a !== undefined && a > b
    case '>=': return a !== undefined && a >= b
    case 'in': return Array.isArray(value) && value.map(cmpVal).includes(a)
    default: throw new Error(`op no soportado: ${op}`)
  }
}

let autoId = 0

class DocRef {
  constructor(readonly path: string) {}
  get id() { return this.path.split('/').pop()! }
  async get() { return snapOf(this) }
  async set(data: Data, opts?: { merge?: boolean }) { applyWrite(this.path, data, Boolean(opts?.merge)) }
  async create(data: Data) {
    if (store.has(this.path)) throw new AlreadyExists('ALREADY_EXISTS')
    applyWrite(this.path, data, false)
  }
  async update(data: Data) {
    if (!store.has(this.path)) throw new Error(`NOT_FOUND ${this.path}`)
    applyWrite(this.path, data, true)
  }
  async delete() { store.delete(this.path); bump(this.path) }
  collection(name: string) { return new CollRef(`${this.path}/${name}`) }
}

function snapOf(ref: DocRef) {
  const d = store.get(ref.path)
  return { id: ref.id, ref, exists: d !== undefined, data: () => (d ? { ...d } : undefined) }
}

class Query {
  constructor(
    readonly collPath: string,
    readonly filters: [string, string, any][] = [],
    readonly max = Infinity,
  ) {}
  where(field: string, op: string, value: any) { return new Query(this.collPath, [...this.filters, [field, op, value]], this.max) }
  limit(n: number) { return new Query(this.collPath, this.filters, n) }
  orderBy() { return this }
  async get() {
    const prefix = this.collPath + '/'
    const docs = [...store.keys()]
      .filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .filter(p => this.filters.every(([f, op, v]) => matches(store.get(p)!, f, op, v)))
      .slice(0, this.max)
      .map(p => snapOf(new DocRef(p)))
    return { docs, empty: docs.length === 0, size: docs.length }
  }
}

class CollRef extends Query {
  constructor(path: string) { super(path) }
  doc(id?: string) { return new DocRef(`${this.collPath}/${id ?? `auto${++autoId}`}`) }
  async add(data: Data) { const ref = this.doc(); applyWrite(ref.path, data, false); return ref }
}

export const fakeDb = {
  collection: (name: string) => new CollRef(name),
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
    const writes: (() => void)[] = []
    const reads = new Map<string, number>()
    const tx = {
      get: async (refOrQuery: DocRef | Query) => {
        // Igual que Firestore: toda lectura va antes de cualquier escritura.
        if (writes.length > 0) throw new Error('Firestore transactions require all reads to be executed before all writes.')
        if (refOrQuery instanceof DocRef) {
          reads.set(refOrQuery.path, versions.get(refOrQuery.path) ?? 0)
          return snapOf(refOrQuery)
        }
        const q = await refOrQuery.get()
        for (const d of q.docs) reads.set(d.ref.path, versions.get(d.ref.path) ?? 0)
        return q
      },
      update: (ref: DocRef, data: Data) => { writes.push(() => { if (!store.has(ref.path)) throw new Error(`NOT_FOUND ${ref.path}`); applyWrite(ref.path, data, true) }) },
      set: (ref: DocRef, data: Data, opts?: { merge?: boolean }) => { writes.push(() => applyWrite(ref.path, data, Boolean(opts?.merge))) },
      create: (ref: DocRef, data: Data) => { writes.push(() => { if (store.has(ref.path)) throw new AlreadyExists('ALREADY_EXISTS'); applyWrite(ref.path, data, false) }) },
      delete: (ref: DocRef) => { writes.push(() => { store.delete(ref.path); bump(ref.path) }) },
    }
    const out = await fn(tx)
    const stale = [...reads].some(([path, v]) => (versions.get(path) ?? 0) !== v)
    if (stale) continue
    for (const w of writes) w()
    return out
    }
    throw new Error('ABORTED: demasiados reintentos de transacción')
  },
}

/** Utilidades para las pruebas. */
export const fakeStore = {
  reset() { store.clear(); versions.clear(); autoId = 0 },
  put(path: string, data: Data) { store.set(path, { ...data }); bump(path) },
  get(path: string): Data | undefined { const d = store.get(path); return d ? { ...d } : undefined },
  list(collPath: string): { id: string; data: Data }[] {
    const prefix = collPath + '/'
    return [...store.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, d]) => ({ id: p.slice(prefix.length), data: { ...d } }))
  },
}
