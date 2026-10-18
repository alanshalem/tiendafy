import { describe, expect, it } from 'vitest';
import { cn } from '@tiendafy/ui';

/**
 * `cn` tiene que resolver las clases que se pisan, no solo concatenarlas.
 * Cuando conviven, el ganador lo decide el orden del stylesheet — que no es el
 * que se lee en el código — y aparecen bugs de los que cuesta desconfiar: una
 * celda fija que queda por debajo de las filas, un ancho que no se puede
 * sobreescribir desde afuera.
 */
describe('cn', () => {
  it('deja la última de las que pelean por la misma propiedad', () => {
    expect(cn('z-[1]', 'z-20')).toBe('z-20');
    expect(cn('px-2', 'px-5')).toBe('px-5');
    expect(cn('w-full', 'w-64')).toBe('w-64');
  });

  it('resuelve también los tokens propios del design system', () => {
    expect(cn('bg-surface', 'bg-danger')).toBe('bg-danger');
    expect(cn('text-fg-muted', 'text-fg')).toBe('text-fg');
    expect(cn('shadow-card', 'shadow-overlay')).toBe('shadow-overlay');
    expect(cn('h-header', 'h-10')).toBe('h-10');
    expect(cn('text-fg', 'text-primary-ink')).toBe('text-primary-ink');
    expect(cn('text-fg-muted', 'text-status-fg')).toBe('text-status-fg');
  });

  // El caso que rompió los <select>: la posición del fondo se llevaba puesto al
  // color del fondo. Queda escrito para que se entienda por qué la flechita del
  // Select va por `style` y no por clases.
  it('trata la posición del fondo como el mismo grupo que el color', () => {
    expect(cn('bg-surface', 'bg-[right_0.5rem_center]')).toBe('bg-[right_0.5rem_center]');
  });

  it('no toca las que no compiten', () => {
    expect(cn('sticky left-0 bg-surface', 'z-20 py-2')).toBe('sticky left-0 bg-surface z-20 py-2');
  });

  it('sigue soportando las condicionales de clsx', () => {
    const compact: boolean = false;
    expect(cn('p-2', compact && 'p-8', undefined, ['text-fg'])).toBe('p-2 text-fg');
  });
});
