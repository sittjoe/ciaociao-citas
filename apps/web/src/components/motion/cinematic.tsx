'use client'

/**
 * Atelier cinemático — scroll- and cursor-driven depth, no WebGL.
 *
 * The hero behaves like a jewelry vitrine: layers sit at different depths
 * (cursor micro-parallax + scroll parallax), the title rises out of a mask
 * with real 3D perspective, and a champagne light sweep crosses surfaces the
 * way a lamp catches metal. Everything is transform/opacity only (60fps), and
 * every effect collapses to a static, fully readable layout under
 * prefers-reduced-motion.
 */

import {
  createContext, useContext, useEffect, useRef, useState,
  type ReactNode, type CSSProperties,
} from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// ── ParallaxStage / ParallaxLayer ──────────────────────────────────────────
// Stage tracks the cursor (smoothed by a spring) and exposes normalized
// -1…1 values. Layers multiply them by their depth: positive depth drifts
// with the cursor (foreground), negative drifts against it (background).

interface StageContextValue {
  px: MotionValue<number>
  py: MotionValue<number>
  enabled: boolean
}
const StageContext = createContext<StageContextValue | null>(null)

export function ParallaxStage({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  const [canHover, setCanHover] = useState(false)
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])
  const enabled = canHover && !reduced

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const px = useSpring(rawX, { stiffness: 50, damping: 18, mass: 0.6 })
  const py = useSpring(rawY, { stiffness: 50, damping: 18, mass: 0.6 })

  return (
    <StageContext.Provider value={{ px, py, enabled }}>
      <div
        className={className}
        style={{ perspective: 1100 }}
        onPointerMove={e => {
          if (!enabled) return
          const r = e.currentTarget.getBoundingClientRect()
          rawX.set(((e.clientX - r.left) / r.width) * 2 - 1)
          rawY.set(((e.clientY - r.top) / r.height) * 2 - 1)
        }}
        onPointerLeave={() => { rawX.set(0); rawY.set(0) }}
      >
        {children}
      </div>
    </StageContext.Provider>
  )
}

export function ParallaxLayer({
  depth = 1,
  children,
  className,
  style,
}: {
  /** px of max drift; negative moves against the cursor (reads as far away) */
  depth?: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const stage = useContext(StageContext)
  const fallbackX = useMotionValue(0)
  const fallbackY = useMotionValue(0)
  const sourceX = stage?.enabled ? stage.px : fallbackX
  const sourceY = stage?.enabled ? stage.py : fallbackY
  const x = useTransform(sourceX, v => v * depth)
  const y = useTransform(sourceY, v => v * depth)

  return (
    <motion.div className={className} style={{ ...style, x, y }}>
      {children}
    </motion.div>
  )
}

// ── ScrollParallax ─────────────────────────────────────────────────────────
// Translates children as the wrapper scrolls through the viewport.
// speed < 1 lags behind the scroll (reads as background depth).

export function ScrollParallax({
  speed = 0.85,
  scaleFrom,
  children,
  className,
}: {
  speed?: number
  /** optional settle: scales from this value to 1 across the scroll range */
  scaleFrom?: number
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const range = (1 - speed) * 320
  const y = useTransform(scrollYProgress, [0, 1], [0, range])
  const scale = useTransform(scrollYProgress, [0, 1], [scaleFrom ?? 1, 1])

  if (reduced) return <div ref={ref} className={className}>{children}</div>
  return (
    <motion.div ref={ref} className={className} style={{ y, scale }}>
      {children}
    </motion.div>
  )
}

// ── TitleReveal ────────────────────────────────────────────────────────────
// Splits text into letters that rise out of an overflow mask while tilting
// upright in 3D. The serif title emerging like a piece lifted from its case.

export function TitleReveal({
  text,
  delay = 0,
  className,
}: {
  text: string
  delay?: number
  className?: string
}) {
  const letters = Array.from(text)
  let visibleIndex = -1
  return (
    <span className={className} aria-label={text} role="text" style={{ display: 'inline-block' }}>
      {letters.map((ch, i) => {
        if (ch !== ' ') visibleIndex++
        const stagger = visibleIndex
        return ch === ' ' ? (
          <span key={i}>&nbsp;</span>
        ) : (
          <span
            key={i}
            aria-hidden
            style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', perspective: 600 }}
          >
            <motion.span
              style={{ display: 'inline-block', transformOrigin: '50% 100%', willChange: 'transform' }}
              initial={{ y: '108%', rotateX: -68, opacity: 0 }}
              animate={{ y: '0%', rotateX: 0, opacity: 1 }}
              transition={{ ease: EASE, duration: 0.9, delay: delay + stagger * 0.05 }}
            >
              {ch}
            </motion.span>
          </span>
        )
      })}
    </span>
  )
}

// ── LightSweep ─────────────────────────────────────────────────────────────
// A soft champagne specular band that crosses the surface once when it
// enters the viewport — the vitrine lamp catching the piece.

export function LightSweep({
  delay = 0,
  className,
}: {
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) return null
  return (
    <motion.span
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    >
      <motion.span
        style={{
          position: 'absolute',
          top: '-20%',
          bottom: '-20%',
          width: '34%',
          transform: 'skewX(-18deg)',
          background:
            'linear-gradient(90deg, transparent, color-mix(in oklch, var(--champagne-soft) 38%, transparent) 45%, color-mix(in oklch, white 50%, transparent) 50%, color-mix(in oklch, var(--champagne-soft) 38%, transparent) 55%, transparent)',
          mixBlendMode: 'soft-light',
        }}
        initial={{ left: '-45%' }}
        whileInView={{ left: '125%' }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ ease: [0.4, 0.0, 0.2, 1], duration: 1.6, delay }}
      />
    </motion.span>
  )
}

// ── DepthReveal ────────────────────────────────────────────────────────────
// Scroll-triggered entrance with real perspective: the element rises and
// tilts upright, like a tray of pieces being set on the counter.

export function DepthReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 34, rotateX: 14, transformPerspective: 900 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ ease: EASE, duration: 0.7, delay }}
      style={{ transformOrigin: '50% 100%', willChange: 'transform' }}
    >
      {children}
    </motion.div>
  )
}
