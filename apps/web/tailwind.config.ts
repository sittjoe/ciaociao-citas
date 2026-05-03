import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        champagne: {
          DEFAULT: 'oklch(0.66 0.083 80)',
          deep:    'oklch(0.53 0.069 78)',
          soft:    'oklch(0.90 0.041 82)',
          tint:    'oklch(0.97 0.018 82)',
        },
        ink: {
          DEFAULT: 'oklch(0.18 0.009 73)',
          muted:   'oklch(0.47 0.014 73)',
          subtle:  'oklch(0.68 0.011 73)',
          line:    'oklch(0.88 0.026 80)',
        },
        cream: {
          DEFAULT: 'oklch(0.982 0.008 86)',
          soft:    'oklch(0.95 0.014 84)',
        },
        vellum: '#F7F2E8',
        porcelain: 'oklch(0.992 0.006 86)',
        showroom: {
          ink: 'oklch(0.145 0.017 66)',
          velvet: 'oklch(0.34 0.038 52)',
          stone: 'oklch(0.89 0.024 78)',
        },
        admin: {
          surface: 'oklch(0.977 0.006 82)',
          panel:   'oklch(0.991 0.004 82)',
          line:    'oklch(0.89 0.018 78)',
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif:   ['var(--font-cormorant)', 'Georgia', 'serif'],
        display: ['var(--font-cormorant)', 'Georgia', 'serif'],
      },
      fontSize: {
        '11':          ['0.6875rem', { lineHeight: '1rem' }],
        '13':          ['0.8125rem', { lineHeight: '1.125rem' }],
        'display-sm':  ['1.75rem',   { lineHeight: '2rem',    letterSpacing: '-0.02em' }],
        'display-md':  ['2.5rem',    { lineHeight: '2.75rem', letterSpacing: '-0.02em' }],
        'display-lg':  ['4rem',      { lineHeight: '4.25rem', letterSpacing: '-0.03em' }],
      },
      letterSpacing: {
        eyebrow:         '0.18em',
        'display-eyebrow': '0.32em',
      },
      boxShadow: {
        soft:    '0 1px 2px color-mix(in oklch, var(--showroom-ink) 5%, transparent), 0 10px 30px color-mix(in oklch, var(--showroom-ink) 7%, transparent)',
        lift:    '0 2px 4px color-mix(in oklch, var(--showroom-ink) 8%, transparent), 0 18px 48px color-mix(in oklch, var(--showroom-ink) 12%, transparent)',
        pop:     '0 10px 30px color-mix(in oklch, var(--champagne) 26%, transparent)',
        warm:    '0 28px 80px color-mix(in oklch, var(--showroom-ink) 18%, transparent)',
        whisper: '0 0 0 1px var(--ink-line)',
        'focus-ring': '0 0 0 3px rgba(184,153,104,0.18), 0 0 0 1px rgba(184,153,104,0.7)',
      },
      transitionTimingFunction: {
        quart: 'cubic-bezier(0.25, 1, 0.5, 1)',
        quint: 'cubic-bezier(0.22, 1, 0.36, 1)',
        expo:  'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'slide-right': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-left': {
          from: { opacity: '0', transform: 'translateX(-24px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-down':   'fade-down 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':    'scale-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'slide-right': 'slide-right 0.38s cubic-bezier(0.16,1,0.3,1) both',
        'slide-left':  'slide-left 0.38s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
}

export default config
