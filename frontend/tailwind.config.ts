import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{html,ts}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        wood: {
          950: '#0c0804',
          900: '#1a1007',
          800: '#231608',
          700: '#34200f',
          600: '#4a2e14',
          500: '#6b4220',
          400: '#8c5c30',
        },
        parchment: {
          50:  '#fdf8ef',
          100: '#f8f0dc',
          200: '#f0e2c0',
          300: '#e5cc9b',
          400: '#d4ae6e',
          500: '#b8904a',
        },
        leather: {
          700: '#3d2c1e',
          600: '#5c4030',
          500: '#7a5540',
          400: '#9e7060',
        },
        gold: {
          300: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        hp: {
          full:  '#22c55e',
          high:  '#84cc16',
          mid:   '#eab308',
          low:   '#f97316',
          crit:  '#ef4444',
          dead:  '#4b5563',
        },
      },
      boxShadow: {
        panel:        '0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        'panel-inset':'inset 0 2px 8px rgba(0,0,0,0.5)',
        card:         '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        emboss:       'inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 1px rgba(0,0,0,0.4)',
        'active-turn':'0 0 0 2px #f59e0b, 0 0 16px rgba(245,158,11,0.35)',
        'hp-crit':    '0 0 10px rgba(239,68,68,0.5)',
      },
      borderRadius: {
        panel: '10px',
        card:  '6px',
      },
    },
  },
  plugins: [],
};

export default config;
