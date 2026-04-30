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
          theme="dark"
          toastOptions={{
            style: {
              background: '#1A1A1A',
              border: '1px solid #2A2A2A',
              color: '#E8D5A8',
            },
          }}
        />
      </body>
    </html>
  )
}
