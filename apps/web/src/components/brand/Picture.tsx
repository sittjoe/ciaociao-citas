import { cn } from '@/lib/utils'

/*
 * Imágenes editoriales de la portada, ya optimizadas en public/images con
 * sharp (AVIF + WebP en varios anchos, sin metadatos de ubicación). Se sirven
 * con <picture> directo: no pasan por el optimizador de Vercel y el ancho y
 * alto explícitos reservan el espacio (sin CLS).
 */

export type HouseImage = 'showroom-privado' | 'video-consulta' | 'macro-anillo' | 'charola-preparada'

const SOURCES: Record<HouseImage, { widths: number[]; ratio: [number, number] }> = {
  'showroom-privado':  { widths: [480, 768, 1080], ratio: [4, 5] },
  'video-consulta':    { widths: [640, 960, 1440], ratio: [3, 2] },
  'macro-anillo':      { widths: [480, 800, 1200], ratio: [1, 1] },
  'charola-preparada': { widths: [640, 960, 1440], ratio: [3, 2] },
}

function srcSet(name: HouseImage, ext: 'avif' | 'webp') {
  return SOURCES[name].widths.map(w => `/images/${name}-${w}.${ext} ${w}w`).join(', ')
}

export function HousePicture({
  name,
  alt,
  sizes,
  className,
  imgClassName,
  priority = false,
}: {
  name: HouseImage
  alt: string
  /** Igual que en <img sizes>: cuánto mide en pantalla. */
  sizes: string
  className?: string
  imgClassName?: string
  priority?: boolean
}) {
  const { widths, ratio } = SOURCES[name]
  const mid = widths[1]
  return (
    <picture className={cn('block', className)}>
      <source type="image/avif" srcSet={srcSet(name, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(name, 'webp')} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/images/${name}-${mid}.webp`}
        alt={alt}
        width={mid}
        height={Math.round((mid * ratio[1]) / ratio[0])}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={cn('h-full w-full object-cover', imgClassName)}
      />
    </picture>
  )
}
