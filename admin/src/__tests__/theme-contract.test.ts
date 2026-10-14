/**
 * El contrato del tema con el backend: las reglas de las secciones que valida
 * la API y el tema por defecto de una tienda nueva salen del registro
 * compartido (TypeScript) y se escriben en un JSON que el backend embebe.
 * Si alguien toca el registro y no regenera el JSON —o edita el JSON a mano—,
 * este test falla: el backend validaría con reglas viejas o sembraría otro
 * tema que el que dibujan el editor y la tienda.
 *
 * Para regenerarlo: UPDATE_THEME_CONTRACT=1 pnpm --filter ./admin exec vitest run theme-contract
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildThemeContract, defaultThemeConfig, normalizeTheme, SECTION_TYPES } from '@tiendafy/types';

const CONTRACT = resolve(
  import.meta.dirname,
  '../../../backend/src/Modules/Themes/Themes.Infrastructure/theme-contract.json',
);

describe('contrato del tema con el backend', () => {
  const expected = JSON.parse(JSON.stringify(buildThemeContract()));

  if (process.env.UPDATE_THEME_CONTRACT) writeFileSync(CONTRACT, `${JSON.stringify(expected, null, 2)}\n`);

  it('el JSON que lee el backend es el que genera el registro', () => {
    const onDisk = JSON.parse(readFileSync(CONTRACT, 'utf8'));
    expect(
      onDisk,
      'theme-contract.json quedó viejo: regeneralo con UPDATE_THEME_CONTRACT=1 (ver arriba)',
    ).toEqual(expected);
  });

  it('tiene todos los tipos de sección, en el orden del registro', () => {
    expect(Object.keys(expected.sections)).toEqual([...SECTION_TYPES]);
  });

  it('el tema por defecto ya está normalizado (leerlo no lo cambia)', () => {
    const def = defaultThemeConfig();
    expect(normalizeTheme(JSON.parse(JSON.stringify(def)))).toEqual(def);
    expect(def.sections.length).toBeGreaterThan(0);
  });
});
