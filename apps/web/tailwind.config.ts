import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          '50':  '#fdf8ee',
          '100': '#f8edce',
          '200': '#f0d99d',
          '300': '#e8c56c',
          '400': '#d9ab47',
          '500': '#C9A55A',
          '600': '#A88B49',
          '700': '#8a7039',
          '800': '#6c572c',
          '900': '#4e3f1f',
          DEFAULT: '#C9A55A',
          light: '#E8D5A8',
          dark:  '#A88B49',
        },
        rich: {
          DEFAULT: '#1A1A1A',
          black:   '#0D0D0D',
          soft:    '#2A2A2A',
          muted:   '#3D3D3D',
          subtle:  '#525252',
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif:   ['var(--font-cormorant)', 'Georgia', 'serif'],
        display: ['var(--font-cormorant)', 'Georgia', 'serif'],
      },
      boxShadow: {
        gold:    '0 4px 30px rgba(201,165,90,0.15)',
        'gold-lg': '0 8px 50px rgba(201,165,90,0.25)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #C9A55A 0%, #E8D5A8 50%, #C9A55A 100%)',
      },
    },
  },
  plugins: [],
}

export default config
