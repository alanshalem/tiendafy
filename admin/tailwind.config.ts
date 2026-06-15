import type { Config } from 'tailwindcss';
import designSystem from '@tiendafy/design-system';

export default {
  presets: [designSystem],
  // shared/ui incluido: Tailwind genera las clases que usan los componentes de la librería.
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/ui/src/**/*.{ts,tsx}'],
} satisfies Config;
