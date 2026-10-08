import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/*
 * REGLA DURA (oct-2026): la dirección del showroom nunca es pública.
 * Solo puede aparecer en la página PRIVADA de la reserva (/reserva/[code],
 * protegida con enlace firmado o cookie) y en los correos de citas
 * confirmadas (lib/email.ts, servidor). Esta prueba falla si:
 *  - un archivo bajo src/app que no sea reserva/[code] menciona la dirección,
 *  - cualquier componente cliente ('use client') la menciona o importa la
 *    tarjeta que la pinta (todo lo que toca un archivo cliente puede acabar
 *    en el JavaScript que descarga cualquiera),
 *  - alguien vuelve a crear una variable NEXT_PUBLIC_ para la ubicación
 *    (Next la incrusta en el bundle del navegador).
 * El chequeo del build real (`npm run check:privacy`) complementa esta prueba.
 */

const SRC = path.resolve(__dirname, '..')
const PRIVATE_DIR = path.join(SRC, 'app', 'reserva', '[code]') + path.sep

const ADDRESS_REF = /SHOWROOM_ADDRESS|SHOWROOM_MAPS_URL|getShowroomAddress|getShowroomMapsUrl/
const CARD_IMPORT = /from\s+['"][^'"]*LocationCard['"]/
const PUBLIC_ENV = /NEXT_PUBLIC_SHOWROOM/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : []
  })
}

/** 'use client' solo cuenta como directiva: antes de cualquier otra sentencia. */
export function isClientModule(source: string): boolean {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trimStart()
  return /^['"]use client['"]/.test(withoutComments)
}

export function privacyViolation(file: string, source: string): string | null {
  if (PUBLIC_ENV.test(source)) return 'usa una variable NEXT_PUBLIC_ para la ubicación'
  const client = isClientModule(source)
  if (client && (ADDRESS_REF.test(source) || CARD_IMPORT.test(source))) {
    return 'componente cliente que toca la dirección del showroom'
  }
  const inApp = file.startsWith(path.join(SRC, 'app') + path.sep)
  if (inApp && !file.startsWith(PRIVATE_DIR) && ADDRESS_REF.test(source)) {
    return 'página fuera de /reserva/[code] que toca la dirección del showroom'
  }
  return null
}

describe('privacidad de la dirección del showroom', () => {
  it('ningún archivo público ni componente cliente la referencia', () => {
    const offenders = walk(SRC)
      .filter(file => !/\.test\.(ts|tsx)$/.test(file))
      .map(file => {
        const reason = privacyViolation(file, readFileSync(file, 'utf8'))
        return reason ? `${path.relative(SRC, file)}: ${reason}` : null
      })
      .filter(Boolean)
    expect(offenders).toEqual([])
  })

  it('ninguna página pública, componente ni módulo cliente la alcanza por imports indirectos', () => {
    // Grafo de imports (alias @/ y relativos). Un módulo «con dirección» es el
    // que la menciona (hoy: LocationCard, la página privada y lib/email.ts).
    // Lo que se pinta (src/app salvo api/ y la página privada, src/components)
    // y todo módulo cliente no debe llegar a uno de ellos ni de rebote, p. ej.
    // a través de un helper de lib/ que importe lib/email.ts.
    const files = walk(SRC).filter(file => !/\.test\.(ts|tsx)$/.test(file))
    const resolveImport = (from: string, spec: string): string | null => {
      const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2))
        : spec.startsWith('.') ? path.resolve(path.dirname(from), spec)
        : null
      if (!base) return null
      const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
      return candidates.find(c => files.includes(c)) ?? null
    }
    const sources = new Map(files.map(file => [file, readFileSync(file, 'utf8')]))
    const graph = new Map(files.map(file => [
      file,
      [...sources.get(file)!.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
        .map(m => resolveImport(file, m[1]))
        .filter((dep): dep is string => dep !== null),
    ]))
    const withAddress = new Set(files.filter(file => ADDRESS_REF.test(sources.get(file)!)))
    const reachable = (start: string) => {
      const seen = new Set<string>()
      const stack = [start]
      while (stack.length) {
        const cur = stack.pop()!
        if (seen.has(cur)) continue
        seen.add(cur)
        stack.push(...(graph.get(cur) ?? []))
      }
      seen.delete(start)
      return seen
    }
    const apiDir = path.join(SRC, 'app', 'api') + path.sep
    const rendered = (file: string) =>
      isClientModule(sources.get(file)!) ||
      (file.startsWith(path.join(SRC, 'app') + path.sep) && !file.startsWith(apiDir) && !file.startsWith(PRIVATE_DIR)) ||
      file.startsWith(path.join(SRC, 'components') + path.sep)

    const offenders = files
      .filter(rendered)
      .flatMap(file => [...reachable(file)]
        .filter(dep => withAddress.has(dep))
        .map(dep => `${path.relative(SRC, file)} → ${path.relative(SRC, dep)}`))
    expect(offenders).toEqual([])
  })

  it('la página privada sí la usa, y solo desde el servidor', () => {
    const page = readFileSync(path.join(PRIVATE_DIR, 'page.tsx'), 'utf8')
    const card = readFileSync(path.join(PRIVATE_DIR, 'LocationCard.tsx'), 'utf8')
    expect(page).toMatch(/getShowroomAddress\(\)/)
    expect(isClientModule(page)).toBe(false)
    expect(isClientModule(card)).toBe(false)
    expect(card).not.toMatch(PUBLIC_ENV)
  })

  it('el detector atrapa las fugas típicas', () => {
    const appFile = path.join(SRC, 'app', 'page.tsx')
    const privateClient = path.join(PRIVATE_DIR, 'Algo.tsx')
    expect(privacyViolation(appFile, 'const a = process.env.SHOWROOM_ADDRESS')).not.toBeNull()
    expect(privacyViolation(privateClient, "'use client'\nimport { getShowroomAddress } from './LocationCard'")).not.toBeNull()
    expect(privacyViolation(privateClient, "/* x */\n'use client'\nimport LocationCard from './LocationCard'")).not.toBeNull()
    expect(privacyViolation(path.join(SRC, 'lib', 'x.ts'), 'process.env.NEXT_PUBLIC_SHOWROOM_ADDRESS')).not.toBeNull()
    expect(privacyViolation(path.join(PRIVATE_DIR, 'page.tsx'), 'getShowroomAddress()')).toBeNull()
    expect(privacyViolation(path.join(SRC, 'lib', 'email.ts'), 'process.env.SHOWROOM_ADDRESS')).toBeNull()
  })
})
