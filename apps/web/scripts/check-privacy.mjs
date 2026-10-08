#!/usr/bin/env node
/*
 * Chequeo post-build de privacidad: la dirección del showroom NUNCA puede
 * terminar en lo que el servidor entrega a cualquiera (JavaScript del
 * navegador en .next/static ni HTML/RSC prerenderizado en .next/server).
 *
 * Construye la app con una dirección centinela en el entorno y busca esa
 * cadena (y sus formas codificadas) en los artefactos públicos.
 *
 *   npm run check:privacy            # build con centinela + escaneo
 *   npm run check:privacy -- --no-build   # solo escanea el .next existente
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

const SENTINEL = 'Calle Falsa 123 Col. Prueba'
const SENTINEL_MAPS = 'https://maps.example.invalid/calle-falsa-123'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const nextDir = path.join(root, '.next')

if (!process.argv.includes('--no-build')) {
  console.log(`check:privacy → next build con SHOWROOM_ADDRESS="${SENTINEL}"`)
  const r = spawnSync('npx', ['next', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      SHOWROOM_ADDRESS: SENTINEL,
      SHOWROOM_MAPS_URL: SENTINEL_MAPS,
      // Por si alguien la vuelve a declarar: también debe quedarse fuera.
      NEXT_PUBLIC_SHOWROOM_ADDRESS: SENTINEL,
    },
  })
  if (r.status !== 0) {
    console.error('check:privacy: el build falló')
    process.exit(r.status ?? 1)
  }
}

if (!existsSync(nextDir)) {
  console.error('check:privacy: no existe .next; corre sin --no-build')
  process.exit(1)
}

const needles = [
  SENTINEL,
  encodeURIComponent(SENTINEL),
  SENTINEL.replace(/ /g, '+'),
  'Calle Falsa',
  'calle-falsa-123',
]

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

// Lo público: todo .next/static (JS/CSS del navegador) y lo prerenderizado
// que el servidor entrega tal cual (HTML, payload RSC, metadatos de ruta).
const publicFiles = [
  ...walk(path.join(nextDir, 'static')),
  ...walk(path.join(nextDir, 'server', 'app')).filter(f => /\.(html|rsc|body|meta|json|txt|xml)$/.test(f)),
  ...walk(path.join(nextDir, 'server', 'pages')).filter(f => /\.(html|json)$/.test(f)),
]

const leaks = []
for (const file of publicFiles) {
  const text = readFileSync(file, 'latin1')
  for (const needle of needles) {
    if (text.includes(needle)) leaks.push(`${path.relative(root, file)} contiene «${needle}»`)
  }
}

const html = publicFiles.filter(f => f.endsWith('.html')).length
console.log(`check:privacy: ${publicFiles.length} archivos públicos revisados (${html} HTML prerenderizados)`)
if (leaks.length) {
  console.error('check:privacy: FUGA de la dirección del showroom:\n  ' + leaks.join('\n  '))
  process.exit(1)
}
console.log('check:privacy: OK, la dirección no aparece en nada público')
