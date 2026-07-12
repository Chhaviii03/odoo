/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0c10',
          900: '#0f1218',
          800: '#161b24',
          700: '#1d2430',
          600: '#2a3340',
          500: '#3a4556',
        },
        accent: {
          DEFAULT: '#7c5cff',
          soft: '#a48bff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
