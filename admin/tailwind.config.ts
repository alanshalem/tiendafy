import designSystem from '@tiendafy/design-system';

// Cargado por Tailwind 4 vía `@config`. El preset del design system sigue
// siendo la fuente de tokens; `content` lo maneja la auto-detección de v4
// más los `@source` del CSS de entrada.
export default {
  presets: [designSystem],
};
