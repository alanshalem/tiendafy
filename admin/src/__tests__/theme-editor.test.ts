import { describe, expect, it } from 'vitest';
import { baseTheme, contrastRatio, normalizeTheme } from '@tiendafy/types';
import { searchOptions } from '../pages/theme-editor-search';
import { changedAreas } from '../pages/ThemeEditor';

describe('searchOptions', () => {
  it('encuentra por palabra suelta aunque no sea el nombre del control', () => {
    const hits = searchOptions('transferencia');
    expect(hits.map((h) => h.view)).toContain('product-detail');
  });

  it('ignora acentos: quien escribe rápido no los pone', () => {
    expect(searchOptions('cupon').length).toBeGreaterThan(0);
    expect(searchOptions('CUPÓN').length).toBeGreaterThan(0);
  });

  it('exige todos los términos, no cualquiera', () => {
    expect(searchOptions('logo tienda').length).toBeGreaterThan(0);
    expect(searchOptions('logo jirafa')).toHaveLength(0);
  });

  it('sin búsqueda no devuelve nada (la lista completa no ayuda)', () => {
    expect(searchOptions('   ')).toHaveLength(0);
  });
});

describe('changedAreas', () => {
  const base = () => normalizeTheme({}, []);

  it('sin cambios, no lista nada', () => {
    expect(changedAreas(base(), base())).toEqual([]);
  });

  it('nombra en palabras la parte que cambió', () => {
    const draft = base();
    draft.colors = { ...draft.colors, primary: '0 0 0' };
    draft.footer = { ...draft.footer, showNewsletter: true };
    expect(changedAreas(draft, base())).toEqual(['Colores de tu marca', 'Pie de página']);
  });

  it('sin publicado todavía no inventa cambios', () => {
    expect(changedAreas(base(), null)).toEqual([]);
  });
});

describe('contrastRatio', () => {
  it('negro sobre blanco es el máximo (21)', () => {
    expect(contrastRatio('0 0 0', '255 255 255')).toBeCloseTo(21, 1);
  });

  it('un color contra sí mismo no tiene contraste', () => {
    expect(contrastRatio('120 80 40', '120 80 40')).toBeCloseTo(1, 5);
  });

  it('el tema por defecto se lee (AA para texto normal)', () => {
    expect(contrastRatio(baseTheme.colors.text, baseTheme.colors.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
