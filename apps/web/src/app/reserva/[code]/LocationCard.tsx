import { MapPin, Navigation } from 'lucide-react'

/**
 * Dirección del showroom para la tarjeta «Cómo llegar».
 *
 * PRIVACIDAD (regla dura): la dirección solo existe en el SERVIDOR. Se lee de
 * SHOWROOM_ADDRESS (la misma variable que los correos de citas confirmadas,
 * lib/email.ts) y NUNCA de una variable NEXT_PUBLIC_*: Next incrusta esas en
 * el JavaScript del navegador en cuanto algún archivo cliente las menciona.
 * Este archivo no lleva 'use client' y solo lo importa la página privada de
 * la reserva (enlace firmado o cookie). Lo vigilan
 * src/lib/showroom-privacy.test.ts y `npm run check:privacy`.
 * Devuelve '' si no está configurada; en ese caso la tarjeta no se pinta.
 */
export function getShowroomAddress(): string {
  return (process.env.SHOWROOM_ADDRESS ?? '').trim()
}

/** Pin exacto de Google Maps (opcional). También solo del servidor. */
export function getShowroomMapsUrl(): string {
  return (process.env.SHOWROOM_MAPS_URL ?? '').trim()
}

interface LocationCardProps {
  address: string
  /** URL exacta de Google Maps (pin verificado). Si falta, se busca por dirección. */
  googleMapsUrl?: string
}

export default function LocationCard({ address, googleMapsUrl }: LocationCardProps) {
  const googleUrl = googleMapsUrl?.trim() || `https://maps.google.com/?q=${encodeURIComponent(address)}`
  const appleUrl  = `https://maps.apple.com/?q=${encodeURIComponent(address)}`

  const buttonClass = 'flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-champagne px-4 py-2.5 text-sm font-medium text-champagne-solid transition-colors duration-200 hover:bg-champagne-soft focus-visible:outline-none focus-visible:shadow-focus-ring'

  return (
    <section aria-labelledby="como-llegar" className="rounded-2xl border border-ink-line bg-porcelain px-5 py-5">
      <h2 id="como-llegar" className="h-eyebrow mb-3 flex items-center gap-1.5">
        <MapPin size={12} strokeWidth={1.5} className="text-champagne-solid" />
        Cómo llegar
      </h2>
      <p className="font-serif text-xl font-light leading-snug text-ink">{address}</p>
      <ul className="mt-3 space-y-1.5 text-xs leading-5 text-ink-muted">
        <li>Llega cinco minutos antes: el equipo te recibe en la puerta.</li>
        <li>Esta dirección es solo para ti y tus invitados; te pedimos no compartirla.</li>
      </ul>
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          <Navigation size={14} strokeWidth={1.5} />
          Google Maps
        </a>
        <a href={appleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          <Navigation size={14} strokeWidth={1.5} />
          Apple Maps
        </a>
      </div>
    </section>
  )
}
