import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        champagne: {
          DEFAULT: '#B89968',
          deep:    '#9A7E50',
          soft:    '#EFE6D3',
          tint:    '#FAF6EE',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          muted:   '#6B6B6B',
          subtle:  '#A8A8A8',
          line:    '#E8E2D4',
        },
        cream: {
          DEFAULT: '#FAFAF7',
          soft:    '#F4F2EC',
        },
        vellum: '#F7F2E8',
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
        soft:    '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        lift:    '0 2px 4px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)',
        pop:     '0 8px 24px rgba(184,153,104,0.18)',
        whisper: '0 0 0 1px #E8E2D4',
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
