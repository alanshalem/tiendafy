import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge necesita conocer los tokens propios del design system para
 * saber que dos clases pelean por la misma propiedad. Lo que no reconoce lo
 * deja pasar tal cual, así que omitir algo no rompe nada: simplemente esa
 * clase no se resuelve y quedan las dos, como pasaba antes.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'primary',
        'primary-hover',
        'primary-fg',
        'accent',
        'accent-fg',
        'bg',
        'bg-subtle',
        'bg-muted',
        'surface',
        'border',
        'border-strong',
        'fg',
        'fg-muted',
        'fg-subtle',
        'success',
        'success-bg',
        'warning',
        'warning-bg',
        'danger',
        'danger-bg',
        'info',
        'info-bg',
      ],
      spacing: ['header', 'sidebar'],
      shadow: ['card', 'overlay'],
      radius: ['sm', 'md', 'lg'],
      font: ['sans', 'heading', 'mono'],
    },
    classGroups: {
      'max-w': [{ 'max-w': ['container'] }],
    },
  },
});

/**
 * Combina clases condicionales y resuelve las que se pisan: si dos apuntan a
 * la misma propiedad, gana la última.
 *
 * Sin esta resolución conviven las dos y decide el orden del stylesheet, que
 * no es el que se lee en el código. Es la causa de dos clases de bug difíciles
 * de ver: un `z-[1]` en una constante compartida que le gana al `z-20` del uso,
 * y anchos o paddings de un componente que no se pueden sobreescribir desde
 * afuera (de ahí la costumbre de meterlos en un div que envuelve).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
