import { cn } from '@/lib/utils'

/**
 * La marca grabada de la casa: «CIAO CIAO MX» en Cinzel, igual que en el
 * certificado. Un solo componente para que la marca no se escriba de cinco
 * maneras distintas (antes: PNG invertido, tres trackings, mayúsculas sueltas).
 */
export function Wordmark({
  className,
  subtitle,
  as: Tag = 'p',
}: {
  className?: string
  /** Segunda línea pequeña (p. ej. «Joyería fina»). */
  subtitle?: string
  as?: 'p' | 'span' | 'div'
}) {
  return (
    <Tag className={cn('leading-none', className)}>
      <span className="wordmark block text-[0.95em]">Ciao Ciao Mx</span>
      {subtitle && (
        <span className="mt-1.5 block pl-[0.3em] font-serif text-[0.62em] italic tracking-normal opacity-80">
          {subtitle}
        </span>
      )}
    </Tag>
  )
}

/**
 * Sello de la casa: monograma «CC» sobre lámina de oro. Decorativo (el texto
 * real va al lado), por eso aria-hidden.
 */
export function HouseSeal({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('gold-leaf relative inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-[3px] rounded-full border border-[oklch(0.97_0.02_86/0.55)]"
      />
      <span
        className="font-wordmark text-[oklch(0.99_0.01_86)]"
        style={{ fontSize: size * 0.3, letterSpacing: '0.08em', paddingLeft: '0.08em', textShadow: '0 1px 0 oklch(0.45 0.06 70 / 0.45)' }}
      >
        CC
      </span>
    </span>
  )
}
