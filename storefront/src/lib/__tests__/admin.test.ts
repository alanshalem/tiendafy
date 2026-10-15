/**
 * El origin del panel (con el que la vista previa habla con el editor) se lee
 * en cada uso. Era una constante calculada al cargar el módulo: si un chunk se
 * evaluaba antes que el <script> con la config de runtime, quedaba fijo el
 * default de desarrollo y la vista previa ignoraba al editor de producción.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminOrigin } from '../admin';
import { isFromEditor, postToEditor } from '../editor-bridge';

const PANEL = 'https://panel.tienda.com.ar';

afterEach(() => {
  delete window.__TIENDAFY_CONFIG__;
  vi.restoreAllMocks();
});

describe('adminOrigin y el canal con el editor', () => {
  it('toma la config inyectada aunque llegue después de cargar el módulo', () => {
    // Los módulos ya están cargados (imports de arriba) y recién ahora aparece la config.
    window.__TIENDAFY_CONFIG__ = { adminOrigin: PANEL };
    expect(adminOrigin()).toBe(PANEL);

    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    postToEditor({ type: 'x' });
    expect(post).toHaveBeenCalledWith({ type: 'x' }, PANEL);

    expect(isFromEditor(new MessageEvent('message', { origin: PANEL }))).toBe(true);
    expect(isFromEditor(new MessageEvent('message', { origin: 'https://otro.com' }))).toBe(false);
  });

  it('sin config inyectada cae a la del entorno', () => {
    expect(adminOrigin()).toMatch(/^https?:\/\//);
  });
});
