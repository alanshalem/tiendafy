/**
 * Las 12 familias de Google Fonts del editor de diseño ya no frenan el primer
 * pintado del panel entero: no están en el index.html y las agrega el selector
 * de tipografía cuando se abre, una sola vez.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EDITOR_FONTS_HREF, useEditorFonts } from '../lib/useEditorFonts';

const links = () => document.head.querySelectorAll(`link[href="${EDITOR_FONTS_HREF}"]`);

afterEach(() => links().forEach((l) => l.remove()));

describe('fuentes del editor', () => {
  it('el index.html no las carga', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');
    expect(html).not.toContain('fonts.googleapis.com/css');
  });

  it('se agregan al abrir el selector, y abrirlo de nuevo no las duplica', () => {
    expect(links()).toHaveLength(0);
    const first = renderHook(() => useEditorFonts());
    expect(links()).toHaveLength(1);
    first.unmount();
    renderHook(() => useEditorFonts());
    expect(links()).toHaveLength(1);
    expect(links()[0]).toHaveAttribute('rel', 'stylesheet');
  });
});
