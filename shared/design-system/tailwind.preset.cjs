/**
 * Tailwind preset compartido. Storefront y admin lo consumen vía
 * `presets: [require('@tiendafy/design-system')]` — un solo lugar
 * para tokens, ambas apps mantienen su propio `content` y plugins.
 *
 * Los colores leen CSS custom properties (tokens.css), así el theming
 * por tenant funciona sin recompilar Tailwind.
 */

/** Helper: color desde CSS var con soporte de alpha de Tailwind. */
const cssVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: cssVar('--color-primary'),
          hover: cssVar('--color-primary-hover'),
          fg: cssVar('--color-primary-fg'),
          ink: cssVar('--color-primary-ink'),
        },
        accent: {
          DEFAULT: cssVar('--color-accent'),
          fg: cssVar('--color-accent-fg'),
        },
        bg: {
          DEFAULT: cssVar('--color-bg'),
          subtle: cssVar('--color-bg-subtle'),
          muted: cssVar('--color-bg-muted'),
        },
        surface: cssVar('--color-surface'),
        border: {
          DEFAULT: cssVar('--color-border'),
          strong: cssVar('--color-border-strong'),
        },
        fg: {
          DEFAULT: cssVar('--color-fg'),
          muted: cssVar('--color-fg-muted'),
          subtle: cssVar('--color-fg-subtle'),
        },
        success: {
          DEFAULT: cssVar('--color-success'),
          bg: cssVar('--color-success-bg'),
        },
        warning: {
          DEFAULT: cssVar('--color-warning'),
          bg: cssVar('--color-warning-bg'),
        },
        danger: {
          DEFAULT: cssVar('--color-danger'),
          bg: cssVar('--color-danger-bg'),
        },
        info: {
          DEFAULT: cssVar('--color-info'),
          bg: cssVar('--color-info-bg'),
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        heading: 'var(--font-heading)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        overlay: 'var(--shadow-overlay)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
      spacing: {
        header: 'var(--header-height)',
        sidebar: 'var(--sidebar-width)',
      },
    },
  },
  plugins: [],
};
