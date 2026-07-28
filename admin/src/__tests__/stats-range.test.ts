import { describe, expect, it } from 'vitest';
import { defaultStatsRange, rangeLabel, rangeQuery } from '../components/stats/StatsToolbar';

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

describe('rangos de estadísticas', () => {
  it('el preset por defecto cubre 30 días terminando hoy (inclusive)', () => {
    const r = defaultStatsRange();
    expect(r.preset).toBe('Últimos 30 días');
    expect(daysBetween(r.from, r.to)).toBe(29); // 30 días inclusive = 29 de distancia
  });

  it('"Hoy" es un rango de un solo día', () => {
    const r = defaultStatsRange('Hoy');
    expect(r.from).toBe(r.to);
  });

  it('"Este mes" arranca el día 1', () => {
    const r = defaultStatsRange('Este mes');
    expect(r.from.endsWith('-01')).toBe(true);
  });

  it('rangeQuery emite from/to en formato de query', () => {
    const q = rangeQuery({ preset: 'x', from: '2026-07-01', to: '2026-07-27' });
    expect(q).toBe('from=2026-07-01&to=2026-07-27');
  });

  it('rangeLabel muestra fechas dd/mm/yyyy para el rango personalizado', () => {
    const label = rangeLabel({ preset: 'Personalizado', from: '2026-07-01', to: '2026-07-27' });
    expect(label).toBe('del 01/07/2026 al 27/07/2026');
  });
});
