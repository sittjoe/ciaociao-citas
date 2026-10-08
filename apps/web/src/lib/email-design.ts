/**
 * Papelería de correo de la casa: la tarjeta de invitación del sitio
 * (papel cálido, doble filete grabado con el exterior en oro, «CIAO CIAO MX»
 * en Cinzel, títulos en Cormorant, texto en Jost) hecha con lo que sí
 * sobrevive en un cliente de correo. Mismo vocabulario que El Estuche del
 * certificado y que los correos del panel: una sola casa.
 *
 * Solo presentación. Ningún dato, enlace ni lógica de envío vive aquí; los
 * llamadores (lib/email.ts, lib/email-daily.ts) pasan el contenido y deciden
 * qué se muestra. La dirección del showroom NUNCA se menciona en este archivo:
 * llega ya armada desde lib/email.ts y solo en correos de citas confirmadas.
 *
 * Restricciones de correo que se respetan:
 *  - tablas y estilos en línea, 600 px, sin flex ni grid;
 *  - Outlook Windows: tabla fantasma de 600 px, botón VML y fuentes forzadas
 *    a Georgia/Arial (Outlook no sigue la pila si la primera no existe);
 *  - Gmail no carga fuentes web ni entiende selectores de atributo: el diseño
 *    se sostiene en Georgia + Helvetica/Arial y los estilos van en bloques
 *    separados (si descarta uno, conserva los demás);
 *  - modo oscuro con paleta propia (Apple Mail, iOS, Outlook.com);
 *  - preheader oculto; botones ≥ 48 px de alto, a todo lo ancho en el teléfono.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[char] ?? char
  })
}

/** Paleta del sitio (globals.css / tailwind.config.ts) en hex para correo. */
export const PAPEL = {
  pagina: '#f4ede1', // --paper-deep
  tarjeta: '#fefcf8', // porcelain
  filoOro: '#ad8d55', // champagne: solo filetes y marcos, nunca texto
  filoTenue: '#e6d9c2', // segundo filete grabado
  linea: '#e1d6c5', // ink-line
  vitela: '#f7f2e8', // vellum: avisos y bloques secundarios
  tinta: '#14110d', // ink
  texto: '#4a443c',
  tenue: '#605a52', // ink-muted (6.6:1 sobre la tarjeta)
  oro: '#765c31', // champagne-solid: texto dorado y botón (6:1 con porcelana)
  porcelana: '#fdfbf7',
  // Semáforo sobrio (solo correos del equipo), siempre acompañado de texto.
  bien: '#3f6b4c',
  atencion: '#8a5a12',
} as const
const P = PAPEL

export const FUENTES = {
  serif: "'Cormorant Garamond',Georgia,'Times New Roman',serif",
  marca: "Cinzel,Georgia,'Times New Roman',serif",
  sans: "Jost,'Helvetica Neue',Helvetica,Arial,sans-serif",
} as const
const F = FUENTES

/** Filete de la casa: dos líneas finas con un rombo al centro (sin imágenes). */
export function ornamento(ancho = 112): string {
  const lado = Math.round((ancho - 24) / 2)
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:collapse"><tr>`
    + `<td width="${lado}" style="width:${lado}px;border-top:1px solid ${P.filoOro};font-size:0;line-height:0">&nbsp;</td>`
    + `<td width="24" align="center" style="width:24px;font-family:Arial,sans-serif;font-size:9px;line-height:9px;color:${P.filoOro};padding:0 0 1px">&#9670;</td>`
    + `<td width="${lado}" style="width:${lado}px;border-top:1px solid ${P.filoOro};font-size:0;line-height:0">&nbsp;</td></tr></table>`
}

/** Versalitas doradas (eyebrows y etiquetas). Recibe texto plano. */
export function etiqueta(texto: string, extra = ''): string {
  return `<div class="cc-oro" style="font-family:${F.sans};font-size:11px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${P.oro}${extra ? ';' + extra : ''}">${escapeHtml(texto)}</div>`
}

/** Párrafo de cuerpo. `html` llega ya escapado por el llamador. */
export function parrafo(html: string, { centrado = false, final = false } = {}): string {
  return `<p class="cc-texto" style="margin:0 0 ${final ? 0 : 18}px;font-family:${F.sans};font-size:15px;line-height:25px;color:${P.texto}${centrado ? ';text-align:center' : ''}">${html}</p>`
}

/**
 * Libro de la cita: filas etiqueta / valor separadas por filetes, como el
 * «horario como libro de reservas» del sitio. Escapa ambos lados. En el
 * teléfono la etiqueta queda encima del valor.
 */
export function libro(rows: [string, string][]): string {
  const tr = rows.map(([label, value], i) => {
    const borde = i ? `border-top:1px solid ${P.linea};` : ''
    return `<tr><td class="cc-apila cc-apila-l cc-linea cc-oro" width="38%" valign="top" style="${borde}padding:13px 12px 13px 0;font-family:${F.sans};font-size:11px;line-height:20px;letter-spacing:2px;text-transform:uppercase;color:${P.oro}">${escapeHtml(label)}</td>`
      + `<td class="cc-apila cc-apila-v cc-linea cc-tinta" align="right" valign="top" style="${borde}padding:13px 0 13px 12px;font-family:${F.sans};font-size:15px;line-height:22px;font-weight:500;color:${P.tinta};text-align:right;font-variant-numeric:lining-nums tabular-nums;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</td></tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cc-linea" style="width:100%;border-collapse:collapse;border-top:1px solid ${P.linea};border-bottom:1px solid ${P.linea};margin:6px 0 26px">${tr}</table>`
}

/**
 * Botón a prueba de balas. Principal: champaña sólido con texto porcelana
 * (como .btn-atelier del sitio). Secundario: contorno dorado. VML para
 * Outlook Windows, 50 px de alto, ancho completo en el teléfono.
 */
export function boton(url: string, label: string, variante: 'principal' | 'secundario' = 'principal'): string {
  const principal = variante === 'principal'
  const fondo = principal ? P.oro : P.tarjeta
  const color = principal ? P.porcelana : P.oro
  const ancho = Math.min(520, Math.max(240, label.length * 10 + 80))
  const href = escapeHtml(url)
  return `<table role="presentation" class="cc-btn-t" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:${principal ? '28px' : '12px'} auto 0;border-collapse:separate"><tr>`
    + `<td class="${principal ? 'cc-btn' : 'cc-btn2'}" align="center" bgcolor="${fondo}" style="background:${fondo};border:1px solid ${P.oro};border-radius:12px">`
    + `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:${ancho}px" arcsize="24%" fillcolor="${fondo}" strokecolor="${P.oro}" strokeweight="1px"><w:anchorlock/><center style="color:${color};font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${escapeHtml(label)}</center></v:roundrect><![endif]-->`
    + `<!--[if !mso]><!--><a class="${principal ? 'cc-btn-a' : 'cc-btn2-a'}" href="${href}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${F.sans};font-size:15px;line-height:20px;font-weight:500;letter-spacing:0.3px;color:${color};text-decoration:none;border-radius:12px">${escapeHtml(label)}</a><!--<![endif]-->`
    + `</td></tr></table>`
}

/** Línea discreta bajo los botones («¿No podrás asistir? Cancelar mi cita»). `html` ya escapado. */
export function notaCentrada(html: string, margen = '16px 0 0'): string {
  return `<p class="cc-tenue" style="margin:${margen};font-family:${F.sans};font-size:13px;line-height:20px;color:${P.tenue};text-align:center">${html}</p>`
}

/** Enlace de texto dorado. */
export function enlace(url: string, label: string): string {
  return `<a class="cc-oro" href="${escapeHtml(url)}" target="_blank" style="color:${P.oro};text-decoration:underline">${escapeHtml(label)}</a>`
}

/** Bloque vitela con etiqueta (invitados, «Importante», ubicación). `html` ya escapado. */
export function aviso(titulo: string, html: string, { centrado = true } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cc-vitela" bgcolor="${P.vitela}" style="width:100%;margin:4px 0 22px;background:${P.vitela};border:1px solid ${P.linea};border-collapse:separate">`
    + `<tr><td class="cc-vitela-pad" style="padding:18px 22px;${centrado ? 'text-align:center;' : ''}font-family:${F.sans};font-size:14px;line-height:22px">${etiqueta(titulo, 'margin:0 0 6px')}<div class="cc-tinta" style="color:${P.tinta}">${html}</div></td></tr></table>`
}

/** Sección con etiqueta para los correos del equipo (digest). `html` ya escapado. */
export function seccion(titulo: string, html: string): string {
  return `<div style="margin:6px 0 26px">${etiqueta(titulo, 'margin:0 0 4px')}${html}</div>`
}

const ESTILO_BASE = `body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;word-spacing:normal}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}`
  + `@media only screen and (max-width:520px){.cc-outer{padding:20px 10px 8px!important}.cc-pad{padding-left:22px!important;padding-right:22px!important}.cc-marco{padding:5px!important}`
  + `.cc-h1{font-size:31px!important;line-height:36px!important}.cc-btn-t{width:100%!important}.cc-btn-a,.cc-btn2-a{display:block!important;padding-left:12px!important;padding-right:12px!important}`
  + `.cc-apila{display:block!important;width:auto!important;text-align:left!important}.cc-apila-l{padding:13px 0 0!important}.cc-apila-v{padding:2px 0 13px!important;border-top:0!important}.cc-vitela-pad{padding:16px 16px!important}}`
const OSCURO: [string, string][] = [
  ['.cc-pagina', 'background:#13100c!important'], ['.cc-tarjeta', 'background:#1c1814!important'],
  ['.cc-marco', 'background:#1c1814!important;border-color:#8a7046!important'], ['.cc-marco2', 'border-color:#3a3127!important'],
  ['.cc-linea', 'border-color:#3a3127!important'], ['.cc-vitela', 'background:#241f19!important;border-color:#3a3127!important'],
  ['.cc-tinta,.cc-texto strong', 'color:#f2ebdf!important'], ['.cc-texto', 'color:#ddd3c3!important'], ['.cc-tenue', 'color:#c9bfae!important'],
  ['.cc-oro', 'color:#d8c08f!important'], ['.cc-btn2', 'background:#1c1814!important;border-color:#d8c08f!important'], ['.cc-btn2-a', 'color:#d8c08f!important'],
]
const reglas = (prefijo: string) => OSCURO.map(([s, d]) => s.split(',').map(x => prefijo + x).join(',') + '{' + d + '}').join('')
const ESTILO_OSCURO = `:root{color-scheme:light dark;supported-color-schemes:light dark}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}`
  + `@media (prefers-color-scheme:dark){${reglas('')}}${reglas('[data-ogsc] ')}`
const FUENTES_WEB = `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@400;500&display=swap');`
const RELLENO_PREHEADER = '&#8199;&#65279;&#847;'.repeat(12)

/**
 * El correo completo: marca arriba, tarjeta grabada con eyebrow + título +
 * filete + contenido, y el pie de la casa. `titulo` y `preheader` llegan
 * crudos (se escapan aquí); `cuerpo` ya viene armado con las piezas de arriba.
 */
export function documento({ titulo, cuerpo, eyebrow = '', preheader = '' }: {
  titulo: string
  cuerpo: string
  eyebrow?: string
  preheader?: string
}): string {
  const pre = preheader.trim()
  return `<!DOCTYPE html><html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>`
    + `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">`
    + `<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">`
    + `<title>${escapeHtml(titulo)} · Ciao Ciao Joyería</title>`
    + `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>body,table,td,div,p,a,span,h1{font-family:Arial,sans-serif!important}.cc-serif{font-family:Georgia,'Times New Roman',serif!important}</style><![endif]-->`
    + `<!--[if !mso]><!--><style>${FUENTES_WEB}</style><!--<![endif]-->`
    + `<style>${ESTILO_BASE}</style><style>${ESTILO_OSCURO}</style></head>`
    + `<body class="cc-pagina" style="margin:0;padding:0;background:${P.pagina};word-spacing:normal">`
    + (pre ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(pre)}${RELLENO_PREHEADER}</div>` : '')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cc-pagina" bgcolor="${P.pagina}" style="width:100%;background:${P.pagina}"><tr><td class="cc-outer" align="center" style="padding:40px 12px 12px">`
    + `<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto">`
    // La marca grabada, como en el encabezado del sitio.
    + `<tr><td class="cc-tinta cc-serif" align="center" style="padding:0 0 0 6px;font-family:${F.marca};font-size:20px;line-height:26px;letter-spacing:6px;color:${P.tinta};mso-line-height-rule:exactly">CIAO CIAO MX</td></tr>`
    + `<tr><td class="cc-tenue cc-serif" align="center" style="padding:6px 0 28px;font-family:${F.serif};font-size:16px;line-height:22px;font-style:italic;color:${P.tenue}">Joyería fina · Citas privadas</td></tr>`
    // La tarjeta: filete exterior en oro, aire de 6 px y un segundo filete tenue.
    + `<tr><td class="cc-marco" bgcolor="${P.tarjeta}" style="background:${P.tarjeta};border:1px solid ${P.filoOro};padding:6px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cc-tarjeta" bgcolor="${P.tarjeta}" style="width:100%;background:${P.tarjeta}"><tr><td class="cc-marco2" style="border:1px solid ${P.filoTenue}">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + (eyebrow ? `<tr><td class="cc-pad" align="center" style="padding:44px 44px 0">${etiqueta(eyebrow)}</td></tr>` : '')
    + `<tr><td class="cc-pad" align="center" style="padding:${eyebrow ? 14 : 44}px 44px 0"><h1 class="cc-h1 cc-tinta cc-serif" style="margin:0;font-family:${F.serif};font-size:36px;line-height:42px;font-weight:400;color:${P.tinta};mso-line-height-rule:exactly">${escapeHtml(titulo)}</h1></td></tr>`
    + `<tr><td class="cc-pad" align="center" style="padding:20px 44px 0">${ornamento(88)}</td></tr>`
    + `<tr><td class="cc-pad cc-texto" style="padding:30px 44px 44px;font-family:${F.sans};font-size:15px;line-height:25px;color:${P.texto};overflow-wrap:anywhere;word-break:break-word">${cuerpo}</td></tr>`
    + `</table></td></tr></table></td></tr>`
    // Pie de la casa.
    + `<tr><td align="center" style="padding:32px 24px 0">${ornamento(56)}</td></tr>`
    + `<tr><td class="cc-tenue" align="center" style="padding:14px 24px 0;font-family:${F.sans};font-size:12px;line-height:19px;letter-spacing:1px;color:${P.tenue}">Ciao Ciao Joyería · Showroom Privado</td></tr>`
    + `<tr><td class="cc-tenue" align="center" style="padding:4px 24px 36px;font-family:${F.sans};font-size:12px;line-height:19px;color:${P.tenue}">Dudas: <a class="cc-oro" href="mailto:hola@ciaociao.mx" style="color:${P.oro};text-decoration:underline">hola@ciaociao.mx</a></td></tr>`
    + `</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`
}
