/**
 * La mini-curva de las tarjetas de estadísticas con series cortas: sin datos
 * armaba un path sin "M" inicial que el navegador rechazaba en consola.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparkline } from '../components/charts';

const paths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '');

describe('Sparkline', () => {
  it('sin datos dibuja una línea plana válida', () => {
    const { container } = render(<Sparkline data={[]} />);
    const ds = paths(container);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatch(/^M/);
    expect(ds[0]).not.toMatch(/NaN|Infinity/);
  });

  it('con un solo punto la curva va de punta a punta a esa altura', () => {
    const { container } = render(<Sparkline data={[500]} />);
    const ds = paths(container);
    for (const d of ds) {
      expect(d).toMatch(/^M/);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
    const line = ds.at(-1)!;
    const [, y1, y2] = /^M0\.0,([\d.]+) L280\.0,([\d.]+)$/.exec(line)!;
    expect(y1).toBe(y2);
  });

  it('con varios puntos arranca con M y tiene un tramo por punto', () => {
    const { container } = render(<Sparkline data={[1, 5, 3, 8]} />);
    const line = paths(container).at(-1)!;
    expect(line.startsWith('M')).toBe(true);
    expect(line.match(/L/g)).toHaveLength(3);
  });
});
