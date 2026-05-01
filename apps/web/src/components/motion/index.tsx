'use client'

import { useRef, useEffect, useState } from 'react'
import {
  MotionConfig,
  LayoutGroup,
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
} from 'framer-motion'

export { motion, AnimatePresence, LayoutGroup }

// ── MotionProvider ─────────────────────────────────────────────────────────
// Wraps the app; disables all animations when OS reduce-motion is on.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.45 }}
    >
      {children}
    </MotionConfig>
  )
}

// ── FadeIn ─────────────────────────────────────────────────────────────────
interface FadeInProps {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}
export function FadeIn({ children, delay = 0, y = 12, className }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── StaggerChildren ────────────────────────────────────────────────────────
interface StaggerChildrenProps {
  children: React.ReactNode
  stagger?: number
  className?: string
}
const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
}
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { ease: EASE, duration: 0.45 } },
}
export function StaggerChildren({ children, className }: StaggerChildrenProps) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className={className}>
      {children}
    </motion.div>
  )
}
export { staggerItem }

// ── StaggerItem ────────────────────────────────────────────────────────────
// Used as <StaggerItem> inside <StaggerChildren> to animate each child.
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  )
}

// ── Reveal ─────────────────────────────────────────────────────────────────
// Scroll-triggered reveal. Fires once when the element enters the viewport.
type RevealDirection = 'up' | 'down' | 'left' | 'right'
interface RevealProps {
  children: React.ReactNode
  delay?: number
  direction?: RevealDirection
  className?: string
}
const revealInitial: Record<RevealDirection, { opacity: number; x?: number; y?: number }> = {
  up:    { opacity: 0, y:  16 },
  down:  { opacity: 0, y: -16 },
  left:  { opacity: 0, x:  16 },
  right: { opacity: 0, x: -16 },
}
export function Reveal({ children, delay = 0, direction = 'up', className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      ref={ref}
      initial={revealInitial[direction]}
      animate={visible ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.55, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── NumberRoll ─────────────────────────────────────────────────────────────
// Animates a number from 0 to `value` on mount. Uses Cormorant via h-numeric.
interface NumberRollProps {
  value: number
  className?: string
  duration?: number
  format?: (n: number) => string
}
export function NumberRoll({ value, className, duration = 0.9, format }: NumberRollProps) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) =>
    format ? format(Math.round(latest)) : String(Math.round(latest)),
  )
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    const unsub = rounded.on('change', setDisplay)
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => { controls.stop(); unsub() }
  }, [value, duration, motionValue, rounded])

  return <span className={className}>{display}</span>
}

// ── PageTransition ─────────────────────────────────────────────────────────
// Wraps a wizard step. Direction: 1 = forward (slide left in), -1 = back.
interface PageTransitionProps {
  id: string
  direction?: 1 | -1
  children: React.ReactNode
  className?: string
}
export function PageTransition({ id, direction = 1, children, className }: PageTransitionProps) {
  const x = direction === 1 ? 24 : -24
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0, x }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -x }}
        transition={{ ease: [0.25, 1, 0.5, 1], duration: 0.38 }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
