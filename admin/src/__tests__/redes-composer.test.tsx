/**
 * El compositor de posts para redes: un texto para todas las cuentas (con
 * variaciones por red), imágenes por URL, cupón para medir ventas, y guardar
 * como borrador o programado. Lo que importa es lo que viaja a la API.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerModal } from '../pages/redes-composer';
import { providerMeta } from '../pages/redes-shared';
import { fixture, mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

type Channels = Parameters<typeof ComposerModal>[0]['channels'];
type Account = Parameters<typeof ComposerModal>[0]['accounts'][number];

const channels = fixture<Channels>('/api/v1/admin/social/channels');
const account = (provider: string, name: string): Account =>
  ({
    id: `${provider}-0000-0000-0000-000000000000`.slice(0, 36),
    provider,
    providerId: `${provider}-1`,
    name,
    username: name.toLowerCase(),
    avatarUrl: null,
    authorized: true,
    connectedAtUtc: '2026-10-01T00:00:00Z',
  }) as unknown as Account;

const accounts = [
  account('meta_facebook', 'Tienda FB'),
  account('meta_instagram', 'Tienda IG'),
  account('x', 'TiendaX'),
  account('telegram', 'Canal'),
];

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compositor de redes', () => {
  it('arma el post para varias cuentas y lo guarda', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/admin/social/posts', {
      id: '99999999-0000-0000-0000-000000000000',
      status: 'Draft',
      targets: [],
    });
    const onSaved = vi.fn();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderWithProviders(
      <ComposerModal
        post={null}
        channels={channels}
        accounts={accounts}
        initialDate={null}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    await settle(3);

    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getAllByRole('textbox')[0]!, '¡Llegó la temporada! Usá VERANO10.');
    for (const box of dialog.queryAllByRole('checkbox')) await user.click(box);

    const save = dialog
      .queryAllByRole('button')
      .find((b) => /guardar|programar|publicar/i.test(b.textContent ?? ''));
    expect(save).toBeDefined();
    await user.click(save!);

    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/admin/social/posts')).toBe(
        true,
      ),
    );
    const body = api.calls.find((c) => c.method === 'POST')!.body as { content: string; targets: unknown[] };
    expect(body.content).toContain('VERANO10');
  });

  it('se puede tocar todo sin romperlo (y editar un post existente)', { timeout: 60_000 }, async () => {
    const api = mockApi();
    // La IA no está en las fixtures (necesita una clave): su contrato es { text }.
    api.on('POST', '/api/v1/ai/short-text', { text: 'Texto mejorado' });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const existing = {
      id: '88888888-0000-0000-0000-000000000000',
      content: 'Post viejo',
      mediaUrls: ['https://cdn.example/remera.png'],
      status: 'Scheduled',
      scheduleStatus: 'Pending',
      scheduledAtUtc: '2030-01-01T12:00:00Z',
      publishedAtUtc: null,
      createdAtUtc: '2026-10-01T00:00:00Z',
      isEditable: true,
      couponCode: 'VIEJO',
      attributedOrders: 0,
      attributedRevenueMinor: 0,
      targets: [
        {
          accountId: accounts[0]!.id,
          provider: 'meta_facebook',
          accountName: 'Tienda FB',
          contentOverride: 'Solo FB',
        },
      ],
    };
    renderWithProviders(
      <ComposerModal
        post={existing as never}
        channels={channels}
        accounts={accounts}
        initialDate={new Date('2030-02-01T10:00:00Z')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await settle(3);
    // El modal va en un portal (fuera del contenedor del render); si la
    // exploración lo cierra (Cancelar), queda un contenedor vacío.
    await explore(user, () => screen.queryByRole('dialog') ?? document.createElement('div'), 60);
    expect(crashes()).toEqual([]);
  });
});

describe('compositor de redes: reglas y acciones', () => {
  const POSTS = '/api/v1/admin/social/posts';
  const fb = accounts[0]!;
  const ig = accounts[1]!;
  const x = accounts[2]!;
  const saved = { id: '77777777-0000-0000-0000-000000000000', status: 'Draft', targets: [] };

  function open(props: Partial<Parameters<typeof ComposerModal>[0]> = {}) {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <ComposerModal
        post={null}
        channels={channels}
        accounts={[...accounts, { ...account('x', 'Vencida'), id: 'vencida', authorized: false }]}
        initialDate={null}
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />,
    );
    return { onSaved, onClose };
  }

  const dialog = async () => within(await screen.findByRole('dialog', {}, { timeout: 5000 }));
  const text = (d: ReturnType<typeof within>) =>
    d.getByPlaceholderText(/Qué querés contar/) as HTMLTextAreaElement;
  const setup = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

  it('valida contra cada red: imagen obligatoria en Instagram y largo de X', async () => {
    mockApi();
    const user = setup();
    open();
    const d = await dialog();
    expect(d.getByText(/Elegí al menos una cuenta/)).toBeInTheDocument();
    // La cuenta vencida no se puede elegir.
    expect(d.getByTitle('Vencida — reconectá la cuenta')).toBeDisabled();

    await user.click(d.getByTitle(ig.name));
    expect(d.getByText(/Instagram exige al menos una imagen/)).toBeInTheDocument();
    expect(d.getByRole('button', { name: /Publicar ahora/ })).toBeDisabled();

    // Imagen por URL: con Enter o con el botón; se puede quitar.
    const url = d.getByPlaceholderText(/URL pública de la imagen/);
    await user.type(url, 'https://cdn.example/a.jpg');
    await user.keyboard('[Enter]');
    expect(d.queryByText(/exige al menos una imagen/)).not.toBeInTheDocument();
    await user.type(url, '   ');
    expect(d.getByRole('button', { name: 'Agregar' })).toBeDisabled();
    await user.clear(url);
    await user.type(url, 'https://cdn.example/b.jpg');
    await user.click(d.getByRole('button', { name: 'Agregar' }));
    expect(d.getAllByTitle('Quitar imagen')).toHaveLength(2);
    await user.click(d.getAllByTitle('Quitar imagen')[0]!);
    expect(d.getAllByTitle('Quitar imagen')).toHaveLength(1);

    // X manda el contador (280) y avisa cuando se pasa.
    await user.click(d.getByTitle(x.name));
    expect(d.getByText('0 / 280')).toBeInTheDocument();
    await user.click(text(d));
    await user.paste('a'.repeat(281));
    expect(d.getByText('281 / 280')).toHaveClass('text-danger');
    expect(d.getByText(/El texto supera el límite de X/)).toBeInTheDocument();

    // Una versión corta solo para X lo resuelve.
    const toggles = () => d.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    const forX = toggles().find((b) => b.textContent?.includes(x.name))!;
    await user.click(forX);
    expect(forX).toHaveAttribute('aria-expanded', 'true');
    await user.type(d.getByPlaceholderText(/Texto solo para X/), 'Versión corta');
    expect(d.queryByText(/supera el límite/)).not.toBeInTheDocument();
    expect(forX).toHaveTextContent('personalizado');
    await user.click(forX);
    expect(forX).toHaveAttribute('aria-expanded', 'false');

    // Destildar una cuenta la saca.
    await user.click(d.getByTitle(x.name));
    expect(d.queryByText('0 / 280')).not.toBeInTheDocument();
  });

  it('el preview cambia de red', async () => {
    mockApi();
    const user = setup();
    open();
    const d = await dialog();
    await user.click(d.getByTitle(fb.name));
    await user.click(d.getByTitle(x.name));
    await user.type(text(d), 'Texto base');
    const labels = [providerMeta(fb.provider).label, providerMeta(x.provider).label];
    const tabs = d.getAllByRole('button').filter((b) => labels.includes(b.textContent ?? ''));
    expect(tabs).toHaveLength(2);
    await user.click(tabs[1]!);
    expect(tabs[1]).toHaveClass('text-primary');
  });

  it('programar guarda y agenda en la fecha elegida (en UTC)', async () => {
    const api = mockApi();
    api.on('POST', POSTS, saved);
    const user = setup();
    const { onSaved, onClose } = open({ initialDate: new Date(2030, 0, 15, 12, 0) });
    const d = await dialog();
    await user.click(d.getByTitle(fb.name));
    await user.type(text(d), 'Nuevo drop');

    await user.click(d.getByRole('button', { name: /Programar/ }));
    expect(await screen.findByText('Post programado')).toBeInTheDocument();
    const schedule = api.calls.find((c) => c.path === `${POSTS}/${saved.id}/schedule`)!;
    expect(schedule.body).toEqual({ scheduledAtUtc: new Date(2030, 0, 15, 12, 0).toISOString() });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('publicar ahora agenda sin fecha; un error de la API se muestra', async () => {
    const api = mockApi();
    api.on('POST', POSTS, { detail: 'La cuenta de Facebook venció.' }, 400);
    const user = setup();
    open();
    const d = await dialog();
    await user.click(d.getByTitle(fb.name));
    await user.type(text(d), 'Ya');
    // Sin fecha no se puede programar.
    expect(d.getByRole('button', { name: /Programar/ })).toBeDisabled();
    await user.click(d.getByRole('button', { name: /Publicar ahora/ }));
    expect(await screen.findByText('La cuenta de Facebook venció.')).toBeInTheDocument();

    api.on('POST', POSTS, saved);
    await user.click(d.getByRole('button', { name: /Publicar ahora/ }));
    expect(await screen.findByText('El post sale en el próximo minuto')).toBeInTheDocument();
    expect(api.calls.find((c) => c.path.endsWith('/schedule'))!.body).toEqual({ scheduledAtUtc: null });
  });

  it('editar uno existente guarda con PUT', async () => {
    const api = mockApi();
    const existing = {
      ...saved,
      content: 'Viejo',
      mediaUrls: [],
      scheduleStatus: 'Pending',
      scheduledAtUtc: null,
      publishedAtUtc: null,
      createdAtUtc: '2026-10-01T00:00:00Z',
      isEditable: true,
      couponCode: null,
      attributedOrders: 0,
      attributedRevenueMinor: 0,
      targets: [{ accountId: fb.id, provider: fb.provider, accountName: fb.name, contentOverride: null }],
    };
    api.on('PUT', `${POSTS}/${saved.id}`, existing);
    const user = setup();
    open({ post: existing as never });
    const d = await dialog();
    await user.click(d.getByRole('button', { name: /Guardar borrador/ }));
    expect(await screen.findByText('Borrador guardado')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'PUT' && c.path === `${POSTS}/${saved.id}`)).toBe(true);
  });

  it('un post publicado se abre en modo lectura', async () => {
    mockApi();
    const user = setup();
    const published = {
      ...saved,
      content: 'Ya salió',
      mediaUrls: [],
      status: 'Published',
      isEditable: false,
    };
    const { onClose } = open({ post: published as never });
    const d = await dialog();
    expect(screen.getByRole('dialog', { name: 'Ver post' })).toBeInTheDocument();
    expect(text(d)).toBeDisabled();
    await user.click(d.getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });

  it('cupón para medir ventas: se elige y se inserta en el texto', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/coupons', {
      items: [
        { id: 'c1', code: 'REDES10', active: true },
        { id: 'c2', code: 'VIEJO', active: false },
      ],
      total: 2,
    });
    const user = setup();
    open();
    const d = await dialog();
    // Se busca por código: la búsqueda va al servidor y los inactivos no se ofrecen.
    await user.type(await d.findByLabelText('Cupón para medir ventas'), 'RE');
    await waitFor(() =>
      expect(api.calls.some((c) => c.path.startsWith('/api/v1/coupons?') && c.path.includes('q=RE'))).toBe(
        true,
      ),
    );
    expect(d.queryByRole('option', { name: 'VIEJO' })).not.toBeInTheDocument();
    await user.click(await d.findByRole('option', { name: 'REDES10' }));
    await user.type(text(d), 'Promo');
    await user.click(d.getByRole('button', { name: 'Insertar en el texto' }));
    expect(text(d).value).toBe('Promo\n🎁 Usá el cupón REDES10');
    // Ya está en el texto: no se ofrece de nuevo.
    expect(d.queryByRole('button', { name: 'Insertar en el texto' })).not.toBeInTheDocument();
  });

  it('mejorar con IA reescribe el borrador; si falla, lo dice', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/ai/status', {
      tasks: [{ task: 'ShortText', available: true, reason: null, code: null }],
    });
    api.on('POST', '/api/v1/ai/short-text', { detail: 'La IA está saturada.' }, 503);
    const user = setup();
    open();
    const d = await dialog();
    // Sin texto no hay qué mejorar.
    expect(d.queryByRole('button', { name: /Mejorar con IA/ })).not.toBeInTheDocument();
    await user.type(text(d), 'remeras nuevas');
    await user.click(await d.findByRole('button', { name: /Mejorar con IA/ }));
    expect(await screen.findByText('La IA está saturada.')).toBeInTheDocument();

    api.on('POST', '/api/v1/ai/short-text', { text: 'Llegaron las remeras nuevas' });
    await user.click(d.getByRole('button', { name: /Mejorar con IA/ }));
    await waitFor(() => expect(text(d).value).toBe('Llegaron las remeras nuevas'));
  });

  it('imagen del catálogo: agrega la foto y el link con UTM', async () => {
    const api = mockApi();
    const user = setup();
    open();
    const d = await dialog();
    await user.click(d.getByRole('button', { name: /Del catálogo/ }));
    const picker = within(await screen.findByRole('dialog', { name: 'Imagen del catálogo' }));
    await waitFor(() => expect(picker.getAllByRole('img').length).toBeGreaterThan(0), { timeout: 3000 });
    await user.click(picker.getAllByRole('img')[0]!.closest('button')!);
    expect(await screen.findByText('Imagen y link del producto agregados al post')).toBeInTheDocument();
    expect(text(d).value).toMatch(/\/productos\/.+\?utm_source=redes/);
    expect(d.getAllByTitle('Quitar imagen')).toHaveLength(1);

    // Los productos sin foto no se ofrecen.
    api.on('GET', '/api/v1/products', {
      items: [{ id: '1', name: 'Sin foto', slug: 'sin-foto', images: [] }],
    });
    await user.click(d.getByRole('button', { name: /Del catálogo/ }));
    const empty = within(await screen.findByRole('dialog', { name: 'Imagen del catálogo' }));
    await user.type(empty.getByPlaceholderText('Buscar producto…'), 'zz');
    await waitFor(() => expect(empty.queryAllByRole('img')).toHaveLength(0), { timeout: 3000 });
  });
});
