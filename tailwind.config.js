/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  // The COLORS theme object builds class names by string concatenation
  // (c.bg, c.solid, c.text, c.ring, c.border), so Tailwind's content
  // scanner can't see them. Safelist every theme-derived class explicitly.
  safelist: [
    // gradient endpoints used in c.bg
    { pattern: /^from-(orange|blue|red|green|purple|yellow)-(500|600)$/ },
    { pattern: /^to-(amber|cyan|rose|emerald|fuchsia)-(400|500)$/ },
    // c.solid
    { pattern: /^bg-(orange|blue|red|green|purple|yellow)-500$/ },
    // c.text
    { pattern: /^text-(orange|blue|red|green|purple|yellow)-400$/ },
    // c.border
    { pattern: /^border-(orange|blue|red|green|purple|yellow)-500$/ },
    // c.ring (with /40 opacity)
    'ring-orange-500/40', 'ring-blue-500/40', 'ring-red-500/40',
    'ring-green-500/40', 'ring-purple-500/40', 'ring-yellow-500/40',
  ],
};
