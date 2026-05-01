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
        },
        ink: {
          DEFAULT: '#1A1A1A',
          muted:   '#6B6B6B',
          subtle:  '#A8A8A8',
        },
        cream: {
          DEFAULT: '#FAFAF7',
          soft:    '#F4F2EC',
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif:   ['var(--font-cormorant)', 'Georgia', 'serif'],
        display: ['var(--font-cormorant)', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        lift: '0 2px 4px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)',
        pop:  '0 8px 24px rgba(184,153,104,0.18)',
      },
    },
  },
  plugins: [],
}

export default config
