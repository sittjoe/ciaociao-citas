import type { Metadata, Viewport } from 'next'
import { Cinzel, Cormorant_Garamond, Jost } from 'next/font/google'
import { Toaster } from 'sonner'
import { MotionProvider } from '@/components/motion'
import './globals.css'

// Las tres voces de la casa, las mismas del certificado «El Estuche»
// (certificados.ciaociao.mx): Cinzel para la marca grabada, Cormorant para
// los títulos y las cifras, Jost para leer. Se sirven desde el propio dominio.
const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-wordmark',
  display: 'swap',
})

// PRIVACIDAD: nada de ubicación del showroom en metadatos, OG ni JSON-LD.
// La dirección solo se entrega en /reserva/[code] y en correos de citas
// confirmadas (ver src/lib/showroom-privacy.test.ts).
export const metadata: Metadata = {
  title: {
    template: '%s | Ciao Ciao Joyería',
    default: 'Cita privada | Ciao Ciao Joyería',
  },
  description:
    'Reserva una cita privada con Ciao Ciao Joyería: en el showroom, con piezas preparadas para ti, o por videollamada para elegir tu anillo de compromiso.',
  keywords: ['joyería fina', 'cita privada', 'anillo de compromiso', 'Ciao Ciao', 'showroom privado'],
  openGraph: {
    title: 'Ciao Ciao Joyería · Cita privada',
    description: 'Una mesa preparada para ti, con tiempo y sin vitrinas de por medio.',
    type: 'website',
    locale: 'es_MX',
    url: 'https://citas.ciaociao.mx',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Ciao Ciao Joyería' }],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  robots: { index: true, follow: true },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://citas.ciaociao.mx'),
}

export const viewport: Viewport = {
  themeColor: '#f8f5ef',
}

// Sin JavaScript, lo que Motion dejó en opacidad 0 para revelarlo al asomar
// tiene que verse igual (lección pagada en El Estuche).
const NOSCRIPT_CSS = '[data-reveal],[data-reveal] *{opacity:1!important;transform:none!important}'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jost.variable} ${cormorant.variable} ${cinzel.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <noscript>
          <style dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} />
        </noscript>
        <MotionProvider>
          {children}
        </MotionProvider>
        <Toaster
          theme="light"
          toastOptions={{
            style: {
              background: 'oklch(0.992 0.006 86)',
              border: '1px solid oklch(0.88 0.026 80)',
              color: 'oklch(0.18 0.009 73)',
              fontFamily: 'var(--font-body)',
              boxShadow: '0 2px 4px oklch(0.145 0.017 66 / 0.06), 0 12px 32px oklch(0.145 0.017 66 / 0.08)',
            },
          }}
        />
      </body>
    </html>
  )
}
