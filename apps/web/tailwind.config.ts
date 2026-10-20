import type { Config } from 'tailwindcss';

/**
 * الألوان كلها متغيّرات CSS من globals.css (هوية prototype.html) —
 * فتعمل مع الوضع الداكن وأنماط التصميم الثلاثة بلا تكرار.
 */
const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), surface2: v('surface2'), line: v('line'),
        ink: v('ink'), ink2: v('ink2'), ink3: v('ink3'),
        accent: v('accent'), 'accent-ink': v('accent-ink'), 'accent-soft': v('accent-soft'),
        side: v('side'), 'side-ink': v('side-ink'), 'side-active': v('side-active'),
        adhoc: v('adhoc'), 'adhoc-soft': v('adhoc-soft'), routine: v('routine'), 'routine-soft': v('routine-soft'),
        ok: v('ok'), 'ok-soft': v('ok-soft'), warn: v('warn'), 'warn-soft': v('warn-soft'), bad: v('bad'), 'bad-soft': v('bad-soft'),
      },
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'Tahoma', '"Segoe UI"', 'sans-serif'] },
      borderRadius: { card: '12px' },
    },
  },
  plugins: [],
};
export default config;
