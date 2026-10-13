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

const panel = () => screen.getByRole('complementary', { name: 'Opciones del diseño' });

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

  it('en celular se alterna entre editar y la vista previa sin recargarla', async () => {
    const { user } = await openEditor();
    const iframe = screen.getByTitle('Preview');
    const preview = iframe.closest('div.flex-1') as HTMLElement;
    const edit = screen.getByRole('button', { name: 'Editar', pressed: true });
    expect(panel()).not.toHaveClass('hidden');
    expect(preview).toHaveClass('hidden');

    await user.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(screen.getByRole('button', { name: 'Vista previa', pressed: true })).toBeInTheDocument();
    expect(panel()).toHaveClass('hidden');
    expect(preview).not.toHaveClass('hidden');
    // El mismo iframe: ocultarlo no lo desmonta, así no recarga ni pierde el tema.
    expect(screen.getByTitle('Preview')).toBe(iframe);

    await user.click(edit);
    expect(panel()).not.toHaveClass('hidden');
  });

  it('en pantallas chicas, lo que no entra en el encabezado está en el menú ⋯', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Más opciones' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Ver tienda/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Descartar/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Modo (oscuro|claro)/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Programar' }));
    expect(await screen.findByRole('dialog', { name: 'Programar la publicación' })).toBeInTheDocument();
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

describe('editor de diseño: historial, copiar de otra tienda y programar', () => {
  const version = { id: 'v-1', publishedAtUtc: '2026-10-01T15:00:00Z' };
  const restored = { customCss: '/* version vieja */' };

  it('volver a una versión la carga en el borrador; si falla, lo dice', async () => {
    const { api, user } = await openEditor((a) => {
      a.on('GET', '/api/v1/theme/history', { items: [version] });
      a.on('POST', `/api/v1/theme/history/${version.id}/restore`, { detail: 'Versión vencida.' }, 400);
    });
    await user.click(within(panel()).getByText('Historial de publicaciones'));
    let dialog = await screen.findByRole('dialog', { name: 'Historial de publicaciones' });
    await user.click(await within(dialog).findByRole('button', { name: 'Volver a esta' }));
    expect(await screen.findByText('Versión vencida.')).toBeInTheDocument();

    api.on('POST', `/api/v1/theme/history/${version.id}/restore`, restored);
    await user.click(within(dialog).getByRole('button', { name: 'Volver a esta' }));
    expect(
      await screen.findByText('Versión cargada en el borrador. Revisala y publicá.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Historial de publicaciones' })).not.toBeInTheDocument();
    await waitFor(() => expect(JSON.stringify(drafts(api).at(-1)?.body)).toContain('version vieja'), {
      timeout: 3000,
    });

    // Sin versiones (o si el historial no carga): lo explica.
    api.on('GET', '/api/v1/theme/history', {}, 500);
    await user.click(within(panel()).getByText('Historial de publicaciones'));
    dialog = await screen.findByRole('dialog', { name: 'Historial de publicaciones' });
    expect(await within(dialog).findByText(/Todavía no hay versiones anteriores/)).toBeInTheDocument();
  });

  it('copiar el diseño publicado de otra tienda del mismo dueño', async () => {
    const tenants = fixture<{ items: { id: string; name: string; subdomain: string }[] }>('/api/v1/tenants');
    const other = { ...tenants.items[0]!, id: 'otra-tienda', name: 'Tienda Hogar', subdomain: 'hogar' };
    const { api, user } = await openEditor((a) => {
      a.on('GET', '/api/v1/tenants', { ...tenants, items: [...tenants.items, other] });
      a.on('POST', `/api/v1/theme/copy-from/${other.id}`, { detail: 'Esa tienda no publicó nada.' }, 400);
    });
    await user.click(within(panel()).getByText('Copiar el diseño de otra tienda'));
    const dialog = await screen.findByRole('dialog', { name: 'Copiar el diseño de otra tienda' });
    // La tienda actual no se ofrece: solo las otras.
    expect(within(dialog).queryByText(tenant.subdomain)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText('Esa tienda no publicó nada.')).toBeInTheDocument();

    api.on('POST', `/api/v1/theme/copy-from/${other.id}`, { customCss: '/* de hogar */' });
    await user.click(within(dialog).getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText('Diseño de Tienda Hogar copiado al borrador.')).toBeInTheDocument();
    await waitFor(() => expect(JSON.stringify(drafts(api).at(-1)?.body)).toContain('de hogar'), {
      timeout: 3000,
    });
  });

  it('programar congela el diseño de ahora (en UTC) y se puede cancelar', async () => {
    const at = '2026-11-27T03:00:00.000Z';
    const { api, user } = await openEditor((a) => {
      a.on('POST', '/api/v1/theme/schedule', { detail: 'La fecha tiene que ser futura.' }, 400);
    });
    await user.click(screen.getByRole('button', { name: 'Programar' }));
    let dialog = await screen.findByRole('dialog', { name: 'Programar la publicación' });
    const program = within(dialog).getByRole('button', { name: 'Programar' });
    expect(program).toBeDisabled(); // sin fecha no se puede
    await user.type(within(dialog).getByLabelText('Fecha y hora'), '2026-11-27T00:00');
    await user.click(program);
    expect(await screen.findByText('La fecha tiene que ser futura.')).toBeInTheDocument();

    api.on('POST', '/api/v1/theme/schedule', { scheduledAtUtc: at });
    await user.click(program);
    expect(await screen.findByText('Publicación programada.')).toBeInTheDocument();
    const body = api.calls.filter((c) => c.path === '/api/v1/theme/schedule' && c.method === 'POST').at(-1)!
      .body as { atUtc: string; config: object };
    expect(body.atUtc).toBe(new Date('2026-11-27T00:00').toISOString());
    expect(body.config).toMatchObject({ sections: expect.any(Array) });

    // Ya programado: el botón lo muestra y el diálogo ofrece cancelar.
    api.on('DELETE', '/api/v1/theme/schedule', { detail: 'Ya se publicó.' }, 409);
    await user.click(screen.getByRole('button', { name: 'Programado' }));
    dialog = await screen.findByRole('dialog', { name: 'Programar la publicación' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Ya se publicó.')).toBeInTheDocument();
    api.on('DELETE', '/api/v1/theme/schedule', {});
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Programación cancelada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Programar' }));
    dialog = await screen.findByRole('dialog', { name: 'Programar la publicación' });
    // El "Cerrar" del pie (el del encabezado del modal es la X).
    await user.click(within(dialog).getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
