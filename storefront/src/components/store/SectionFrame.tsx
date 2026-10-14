'use client';

import { Component, Suspense, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { contrastText, mixRgb } from '@tiendafy/types';
import type { SectionSpacing, ThemeSection } from '@/lib/theme';
import { SectionStyleContext } from './section-context';

/*
 * El marco de cada sección del inicio: aplica lo que es común a todas
 * (fondo, espaciado, alineación, en qué dispositivo se ve) y aísla los
 * errores. Una sección rota antes tiraba la portada entera; ahora se omite
 * esa sola y el resto de la tienda sigue.
 */

// Los espaciados pisan el padding propio del bloque de la sección (`!`): sin
// valor, la sección queda como fue diseñada.
const PADDING_TOP: Record<SectionSpacing, string> = {
  none: '[&>*]:pt-0!',
  sm: '[&>*]:pt-6!',
  md: '[&>*]:pt-12!',
  lg: '[&>*]:pt-20!',
};
const PADDING_BOTTOM: Record<SectionSpacing, string> = {
  none: '[&>*]:pb-0!',
  sm: '[&>*]:pb-6!',
  md: '[&>*]:pb-12!',
  lg: '[&>*]:pb-20!',
};

/**
 * Por dispositivo con CSS y no con JS: el servidor no sabe el ancho de la
 * pantalla, y decidirlo en el cliente hacía que la sección apareciera y
 * desapareciera al hidratar. El corte es el `md` de Tailwind (768 px).
 */
export const HIDE_ON_CLASS = { mobile: 'max-md:hidden', desktop: 'md:hidden' } as const;

function frameProps(section: ThemeSection): { className: string; style?: CSSProperties } | null {
  const { style, hideOn } = section;
  if (!style && !hideOn) return null;
  const classes: string[] = [];
  const css: Record<string, string> = {};
  if (hideOn) classes.push(HIDE_ON_CLASS[hideOn]);
  if (style?.paddingTop) classes.push(PADDING_TOP[style.paddingTop]);
  if (style?.paddingBottom) classes.push(PADDING_BOTTOM[style.paddingBottom]);
  if (style?.align) classes.push(style.align === 'left' ? 'text-left' : 'text-center');
  if (style?.background === 'subtle') css.backgroundColor = 'rgb(var(--color-fg) / 0.04)';
  if (style?.background === 'accent') css.backgroundColor = 'rgb(var(--color-primary) / 0.08)';
  if (style?.background === 'custom' && style.backgroundColor) {
    const bg = style.backgroundColor;
    css.backgroundColor = `rgb(${bg})`;
    // Sobre un fondo propio, el texto se recalcula para que se lea: las
    // variables del tema valen para todo lo que está adentro.
    const fg = contrastText(bg);
    css['--color-fg'] = fg;
    css['--color-fg-muted'] = mixRgb(fg, bg, 0.3);
    css.color = `rgb(${fg})`;
  }
  return {
    className: classes.join(' '),
    style: Object.keys(css).length > 0 ? (css as CSSProperties) : undefined,
  };
}

/** Si una sección tira al dibujarse, no se muestra (y se avisa) en vez de romper la página. */
class SectionErrorBoundary extends Component<{ type: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { area: 'home-section', sectionType: this.props.type },
      extra: { componentStack: info.componentStack },
    });
    console.error(`La sección "${this.props.type}" no se pudo mostrar y se omitió.`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SectionFrame({ section, children }: { section: ThemeSection; children: ReactNode }) {
  const frame = frameProps(section);
  // Suspense además del boundary: en el servidor los boundaries no atajan, y
  // un error en el SSR se resuelve con el fallback del Suspense más cercano
  // (vacío) y se reintenta en el navegador, donde sí ataja el boundary.
  const body = (
    <SectionErrorBoundary type={section.type}>
      <Suspense fallback={null}>{children}</Suspense>
    </SectionErrorBoundary>
  );
  return (
    <SectionStyleContext.Provider value={section.style}>
      {frame ? (
        <div data-section-frame={section.type} className={frame.className || undefined} style={frame.style}>
          {body}
        </div>
      ) : (
        body
      )}
    </SectionStyleContext.Provider>
  );
}
