import type { Metadata } from 'next'
import { BookingWizard } from '@/components/booking/BookingWizard'

export const metadata: Metadata = {
  title: 'Agendar Cita – Ciao Ciao Joyería',
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 sm:py-20">
      {/* Header */}
      <header className="text-center mb-10">
        <h1 className="font-serif text-4xl sm:text-5xl text-gold-400 tracking-widest uppercase">
          Ciao Ciao
        </h1>
        <p className="text-xs text-gold-700 tracking-[0.4em] uppercase mt-2">
          Joyería · Showroom Privado
        </p>
        <div className="w-16 h-px bg-gold-700 mx-auto mt-5" />
        <p className="text-sm text-gold-light mt-5 max-w-sm leading-relaxed">
          Agenda tu visita personalizada a nuestro showroom exclusivo. Selecciona fecha y horario, comparte tus datos y espera nuestra confirmación.
        </p>
      </header>

      {/* Wizard */}
      <div className="w-full max-w-lg">
        <BookingWizard />
      </div>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-gold-800 space-y-1">
        <p>Ciao Ciao Joyería · Showroom Privado</p>
        <p>
          <a href="mailto:hola@ciaociao.mx" className="hover:text-gold-600 transition-colors">
            hola@ciaociao.mx
          </a>
        </p>
      </footer>
    </main>
  )
}
