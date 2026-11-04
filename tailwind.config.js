/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fado: {
          brown: '#8a4b22',
          cream: '#f4ede2',
          ink: '#1c1512',
          scarf: '#ffcf2e',
          collar: '#2f6bff',
          autumn: '#e9a24c',
          dusk: '#2a1b2e',
        },
      },
      fontFamily: {
        display: ['"Baloo 2"', 'ui-rounded', '"SF Pro Rounded"', 'Nunito', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 32px rgba(255, 207, 46, 0.55)',
        soft: '0 10px 40px rgba(20, 8, 24, 0.35)',
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pop: { '0%': { transform: 'scale(.9)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(255,207,46,.6)' },
          '100%': { boxShadow: '0 0 0 22px rgba(255,207,46,0)' },
        },
      },
      animation: {
        floaty: 'floaty 3.2s ease-in-out infinite',
        pop: 'pop .35s cubic-bezier(.2,1.4,.4,1) both',
        pulseRing: 'pulseRing 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
