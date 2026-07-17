import { MapPin } from 'lucide-react'

/**
 * Dirección del showroom para la tarjeta «Cómo llegar».
 * Usa la misma variable que los correos (lib/email.ts) y acepta la variante
 * pública como respaldo. Devuelve '' si no está configurada — en ese caso
 * la tarjeta no se renderiza.
 */
export function getShowroomAddress(): string {
  return (process.env.SHOWROOM_ADDRESS ?? process.env.NEXT_PUBLIC_SHOWROOM_ADDRESS ?? '').trim()
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
    <div className="rounded-2xl border border-ink-line bg-porcelain/70 px-4 py-4">
      <p className="h-eyebrow mb-2 flex items-center gap-1.5">
        <MapPin size={12} strokeWidth={1.5} className="text-champagne-solid" />
        Cómo llegar
      </p>
      <p className="text-sm leading-6 text-ink">{address}</p>
      <p className="mt-1 text-xs leading-5 text-ink-subtle">
        Te recomendamos llegar cinco minutos antes; el equipo te recibirá en la puerta.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          Abrir en Google Maps
        </a>
        <a href={appleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          Abrir en Apple Maps
        </a>
      </div>
    </div>
  )
}
