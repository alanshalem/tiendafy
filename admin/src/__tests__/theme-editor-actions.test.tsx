/**
 * El editor de diseño como herramienta: el autoguardado del borrador,
 * publicar, descartar, deshacer y rehacer con el teclado, el buscador (Ctrl+K),
 * el diálogo con el iframe de la vista previa (solo desde su origen: abrir el
 * panel de lo que se clickeó, borrar una sección, mandarle el tema cuando
 * avisa que está listo) y el error de carga con reintento.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EDITOR_MSG } from '@tiendafy/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storefrontUrl } from '../lib/storefront';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const tenant = fixture<{ items: { subdomain: string }[] }>('/api/v1/tenants').items[0]!;
const origin = storefrontUrl(tenant.subdomain);
const theme = fixture<{ sections: { id: string; type: string; visible: boolean }[] }>('/api/v1/theme/draft');

const panel = () => document.querySelector('aside.w-80') as HTMLElement;

async function openEditor(setup?: (api: MockApi) => void) {
  const api = mockApi();
  // El token firmado con el que el iframe lee el borrador (sin él no se monta).
  api.on('POST', '/api/v1/theme/preview-token', { token: 'pt-firmado' });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/canales/tienda-online');
  await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  await settle(6);
  return { api, user };
}

const drafts = (api: MockApi) =>
  api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/theme/draft');

/** Un cambio cualquiera en el tema: el CSS propio (un textarea, sin selectores de color). */
async function changeCss(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(within(panel()).getByText('Edición avanzada de CSS'));
  const field = within(panel()).getByRole('textbox');
  await user.clear(field);
  await user.type(field, value);
  return field;
}

function fromPreview(data: object, from = origin) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: from }));
  });
}

afterEach(() => vi.useRealTimers());

describe('editor de diseño: guardar y publicar', () => {
  it('autoguarda el borrador y publica lo que se ve', async () => {
    const { api, user } = await openEditor();
    await changeCss(user, '/* marca 123456 */');
    await waitFor(() => expect(drafts(api).length).toBeGreaterThan(0), { timeout: 3000 });
    expect(JSON.stringify(drafts(api).at(-1)!.body)).toContain('marca 123456');

    await user.click(screen.getByRole('button', { name: 'Publicar cambios' }));
    await settle(2);
    expect(JSON.stringify(api.calls.find((c) => c.path === '/api/v1/theme/publish')?.body)).toContain(
      'marca 123456',
    );
    expect(await screen.findByText('Diseño publicado en tu tienda')).toBeInTheDocument();
    // Lo publicado es la nueva base: no queda nada por publicar.
    expect(screen.getByRole('button', { name: 'Sin cambios' })).toBeDisabled();
  });

  it('si publicar falla, lo dice; si el autoguardado falla, ofrece reintentar', async () => {
    const { api, user } = await openEditor((a) => {
      a.on('POST', '/api/v1/theme/publish', { detail: 'El CSS propio tiene reglas no permitidas.' }, 400);
      a.on('PUT', '/api/v1/theme/draft', {}, 500);
    });
    await changeCss(user, '/* marca 654321 */');
    expect(
      await screen.findByRole('button', { name: /No se guardó — Reintentar/ }, { timeout: 3000 }),
    ).toBeInTheDocument();
    api.on('PUT', '/api/v1/theme/draft', {});
    await user.click(screen.getByRole('button', { name: /No se guardó — Reintentar/ }));
    await settle(2);

    await user.click(screen.getByRole('button', { name: 'Publicar cambios' }));
    expect(await screen.findByText('El CSS propio tiene reglas no permitidas.')).toBeInTheDocument();
  });

  it('descartar vuelve a lo publicado (con confirmación)', async () => {
    const { api, user } = await openEditor();
    await changeCss(user, '/* marca abcdef */');
    await user.click(screen.getByRole('button', { name: /Descartar/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Descartar cambios' })).getByRole('button', {
        name: 'Descartar',
      }),
    );
    expect(await screen.findByText('Cambios descartados')).toBeInTheDocument();
    expect(JSON.stringify(drafts(api).at(-1)!.body)).not.toContain('marca abcdef');
  });

  it('Ctrl+Z deshace y Ctrl+Shift+Z / Ctrl+Y rehacen (paso por paso, fuera de los campos)', async () => {
    const { api, user } = await openEditor();
    const field = await changeCss(user, '/* fin */');
    const css = () => (drafts(api).at(-1)!.body as { customCss: string }).customCss;
    await waitFor(() => expect(css()).toBe('/* fin */'), { timeout: 3000 });
    (field as HTMLTextAreaElement).blur();

    // Cada tecla fue un paso: deshacer saca el último carácter.
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(css()).toBe('/* fin *'), { timeout: 3000 });
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(css()).toBe('/* fin */'), { timeout: 3000 });
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}y{/Control}');
    await waitFor(() => expect(css()).toBe('/* fin */'), { timeout: 3000 });
  });

  it('Ctrl+K abre el buscador de opciones', async () => {
    const { user } = await openEditor();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('editor de diseño: la vista previa', () => {
  it('un clic en el preview abre el panel de lo que se tocó; de otro origen se ignora', async () => {
    await openEditor();
    fromPreview({ type: EDITOR_MSG.editSection, target: 'header' }, 'https://malicioso.example');
    await settle(1);
    expect(within(panel()).queryByText('Colores de tu marca')).toBeInTheDocument(); // sigue en el menú

    fromPreview({ type: EDITOR_MSG.editSection, target: 'header' });
    await settle(1);
    expect(within(panel()).queryByText('Colores de tu marca')).not.toBeInTheDocument();

    fromPreview({ type: EDITOR_MSG.editSection, target: 'footer' });
    await settle(1);
    const section = theme.sections.find((s) => s.visible)!;
    fromPreview({ type: EDITOR_MSG.editSection, target: 'section', sectionId: section.id });
    await settle(1);
  });

  it('borrar una sección desde el preview pide confirmación y la saca del borrador', async () => {
    const { api } = await openEditor();
    const section = theme.sections[0]!;
    fromPreview({ type: EDITOR_MSG.deleteSection, sectionId: section.id });
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Eliminar sección' })).getByRole('button', {
        name: 'Eliminar',
      }),
    );
    await waitFor(() => expect(drafts(api).length).toBeGreaterThan(0), { timeout: 3000 });
    const saved = drafts(api).at(-1)!.body as { sections: { id: string }[] };
    expect(saved.sections.some((s) => s.id === section.id)).toBe(false);
  });

  it('cuando el preview avisa que está listo, se le manda el tema', async () => {
    await openEditor();
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post }, configurable: true });
    fromPreview({ type: EDITOR_MSG.previewReady });
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: EDITOR_MSG.theme }), origin),
    );
    expect(post).toHaveBeenCalledWith({ type: EDITOR_MSG.previewCart, open: false }, origin);
  });

  it('cambiar de dispositivo recuerda la elección', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Tablets' }));
    expect(localStorage.getItem('tiendafy.editor.device')).toBe('tablet');
    await user.click(screen.getByRole('button', { name: 'Celulares' }));
    expect(localStorage.getItem('tiendafy.editor.device')).toBe('mobile');
  });
});

describe('editor de diseño: carga', () => {
  it('si el diseño no carga, ofrece reintentar', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/theme/draft', {}, 500);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/canales/tienda-online');
    expect(await screen.findByText('No se pudo cargar el editor. Revisá tu conexión.')).toBeInTheDocument();
    api.on('GET', '/api/v1/theme/draft', fixture('/api/v1/theme/draft'));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  });
});
