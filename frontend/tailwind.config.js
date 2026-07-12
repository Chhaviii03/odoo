/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#714b67',
          hover: '#432c3d',
        },
        secondary: '#017e84',
        success: '#28a745',
        info: '#17a2b8',
        warning: '#ffc107',
        danger: '#dc3545',
        light: '#f9f9f9',
        dark: '#212529',
        gray: {
          100: '#F9FAFB',
          200: '#F3F4F6',
          300: '#E6E9ED',
          400: '#D8DADD',
          500: '#6C757D',
          600: '#495057',
          700: '#374151',
          800: '#212529',
          900: '#111827',
        },
        // Legacy ink → Odoo light surfaces (no black)
        ink: {
          950: '#ffffff',
          900: '#F9FAFB',
          800: '#F3F4F6',
          700: '#E6E9ED',
          600: '#D8DADD',
          500: '#ADB5BD',
        },
        accent: {
          DEFAULT: '#714b67',
          soft: '#714b67',
          hover: '#432c3d',
        },
        // All slate text steps stay dark enough on white
        slate: {
          50: '#F9FAFB',
          100: '#111827',
          200: '#212529',
          300: '#374151',
          400: '#495057',
          500: '#495057',
          600: '#374151',
          700: '#212529',
          800: '#111827',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Odoo Unicode Support Noto', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.625rem',
        sm: '0.25rem',
        lg: '1.25rem',
        xl: '1.25rem',
        '2xl': '1.25rem',
        full: '50rem',
      },
      boxShadow: {
        DEFAULT: '0 0.5rem 1rem rgba(0, 0, 0, 0.1)',
        md: '0 0.5rem 1rem rgba(0, 0, 0, 0.1)',
        lg: '0 0.5rem 1rem rgba(0, 0, 0, 0.1)',
        soft: '0 10px 20px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
