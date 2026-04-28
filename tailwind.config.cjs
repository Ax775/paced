/** Tailwind config — mirrors the inline tailwind.config previously declared
 *  in index.html so the built CSS contains the same Quiet Luxury palette.
 *  The build script (build.mjs) compiles this into dist/styles.css.
 */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        cream: {
          50:  '#FBF9F3',
          100: '#F5F1E8',
          200: '#EDE6D3',
          300: '#E2D8BE',
        },
        sage: {
          50:  '#F2F5F0',
          100: '#E2E9DC',
          200: '#C6D3BB',
          300: '#A8BA98',
          400: '#87A074',
          500: '#6B8559',
          600: '#556B47',
          700: '#42533A',
        },
        terracotta: {
          100: '#F4E2D8',
          200: '#E8C4B0',
          300: '#D9A188',
          400: '#C78264',
          500: '#B06849',
          600: '#8F5138',
        },
        ink: {
          400: '#8B8578',
          500: '#5F5A4E',
          600: '#3E3B33',
          700: '#2A2823',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(66,83,58,0.04), 0 8px 24px rgba(66,83,58,0.06)',
        glow: '0 0 0 1px rgba(168,186,152,0.25), 0 12px 40px rgba(107,133,89,0.12)',
      },
      borderRadius: {
        xl2: '1.25rem',
        xl3: '1.75rem',
      },
    },
  },
  plugins: [],
};
