import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { aviso, boton, documento, libro, parrafo } from './email-design'

const correo = documento({
  eyebrow: 'Cita confirmada',
  titulo: 'Tu cita <está> confirmada',
  preheader: 'domingo 11 de octubre, 2026 · 12:00 pm',
  cuerpo: parrafo('Te esperamos.')
    + libro([['Fecha', 'domingo 11 de octubre, 2026'], ['Código', 'CC-<7Q2K>']])
    + aviso('Importante', 'Solo personas verificadas.')
    + boton('https://citas.ciaociao.mx/reserva/CC-7Q2K?t=a&b=1', 'Ver tu cita'),
})

describe('papelería de correo de la casa', () => {
  it('es HTML de correo: tablas, 600 px, Outlook, modo oscuro y preheader', () => {
    expect(correo).toMatch(/^<!DOCTYPE html><html lang="es"/)
    expect(correo).toContain('max-width:600px')
    expect(correo).toContain('<!--[if mso]><table role="presentation" width="600"')
    expect(correo).toContain('<meta name="color-scheme" content="light dark">')
    expect(correo).toContain('@media (prefers-color-scheme:dark)')
    expect(correo).toMatch(/mso-hide:all">domingo 11 de octubre, 2026 · 12:00 pm/)
    expect(correo).not.toMatch(/display:\s*flex|display:\s*grid/)
    expect(Buffer.byteLength(correo)).toBeLessThan(90 * 1024)
  })

  it('botón a prueba de balas: VML para Outlook y enlace escapado para el resto', () => {
    expect(correo).toContain('<v:roundrect')
    expect(correo).toContain('href="https://citas.ciaociao.mx/reserva/CC-7Q2K?t=a&amp;b=1"')
    expect(correo).toMatch(/padding:15px 30px;[^"]*line-height:20px/) // 50 px de alto con el borde
  })

  it('escapa título y valores del libro', () => {
    expect(correo).toContain('Tu cita &lt;está&gt; confirmada')
    expect(correo).toContain('CC-&lt;7Q2K&gt;')
    expect(correo).not.toContain('<7Q2K>')
  })

  it('las fuentes web siempre caen en Georgia o Helvetica/Arial', () => {
    for (const family of correo.match(/font-family:[^;"]+/g) ?? []) {
      if (/Cormorant|Cinzel/.test(family)) expect(family).toMatch(/Georgia/)
      if (/Jost/.test(family)) expect(family).toMatch(/Arial/)
    }
  })

  it('la papelería nunca conoce la dirección del showroom', () => {
    const src = readFileSync(path.join(__dirname, 'email-design.ts'), 'utf8')
    expect(src).not.toMatch(/SHOWROOM_ADDRESS|SHOWROOM_MAPS_URL|getShowroomAddress/)
  })
})
