/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--c-ink-soft) / <alpha-value>)',
        'ink-line': 'rgb(var(--c-ink-line) / <alpha-value>)',
        white: 'rgb(var(--c-1) / <alpha-value>)',
        gray: {
          100: 'rgb(var(--c-1) / <alpha-value>)',
          200: 'rgb(var(--c-1) / <alpha-value>)',
          300: 'rgb(var(--c-2) / <alpha-value>)',
          400: 'rgb(var(--c-2) / <alpha-value>)',
          500: 'rgb(var(--c-3) / <alpha-value>)',
          600: 'rgb(var(--c-3) / <alpha-value>)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
