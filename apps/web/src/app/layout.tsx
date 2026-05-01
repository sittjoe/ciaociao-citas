import type { Metadata } from 'next'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | Ciao Ciao Joyería',
    default: 'Agendar Cita – Ciao Ciao Joyería',
  },
  description:
    'Agenda tu visita personalizada al showroom privado de Ciao Ciao Joyería. Selecciona tu horario y asegura una experiencia exclusiva.',
  keywords: ['joyería', 'showroom', 'cita', 'Ciao Ciao', 'joyería personalizada', 'México'],
  openGraph: {
    title: 'Ciao Ciao Joyería – Showroom Privado',
    description: 'Agenda tu visita personalizada a nuestro showroom exclusivo.',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster
          theme="light"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.08)',
              color: '#1A1A1A',
              boxShadow: '0 2px 4px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)',
            },
          }}
        />
      </body>
    </html>
  )
}
