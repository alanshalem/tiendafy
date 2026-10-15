/**
 * Campañas de email: editar una (asunto, audiencia segmentada, productos
 * destacados, cupón), ver la audiencia y la vista previa en vivo, mandarse una
 * prueba, enviarla ya o programarla — y lo que viaja a la API en cada caso.
 * Con la campaña sembrada por la demo.
 */
import axe from 'axe-core';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const campaign = fixture<{ items: { id: string; subject: string }[] }>('/api/v1/admin/campaigns').items[0]!;
const coupon = fixture<{ items: { code: string; active: boolean }[] }>('/api/v1/coupons').items.find(
  (c) => c.active,
);
const product = fixture<{ items: { id: string; name: string }[] }>('/api/v1/products').items[0]!;

async function openCampaign() {
  const api = mockApi();
  api.on('POST', '/api/v1/admin/campaigns/audience/preview', { count: 42, sample: [] });
  api.on('POST', '/api/v1/admin/campaigns/preview', { subject: campaign.subject, html: '<p>Hola</p>' });
  api.on('PUT', `/api/v1/admin/campaigns/${campaign.id}`, campaign);
  api.on('POST', '/api/v1/admin/campaigns', campaign);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/marketing');
  await user.click((await screen.findAllByTitle('Editar', {}, { timeout: 5000 }))[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Editar campaña' });
  await settle(2);
  return { api, user, dialog: within(dialog), root: dialog };
}

const body = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body as Record<string, unknown>;

/** Los debounces de 400 ms de la audiencia y la vista previa. */
const debounce = () => new Promise((r) => setTimeout(r, 450));

describe('campañas', () => {
  it('regresión: una vista previa de audiencia sin número no rompe el modal', async () => {
    const { api, dialog } = await openCampaign();
    api.on('POST', '/api/v1/admin/campaigns/audience/preview', {});
    await userEvent.setup().type(dialog.getAllByPlaceholderText('Sin mínimo')[0]!, '1');
    await debounce();
    await settle(2);
    expect(await dialog.findByText('Contando destinatarios…')).toBeInTheDocument();
  });

  it('el modal es accesible', async () => {
    const { root } = await openCampaign();
    expect(await a11yViolations(axe, root)).toEqual([]);
  });

  it('segmenta la audiencia, suma productos y cupón, y guarda el borrador', async () => {
    const { api, user, dialog } = await openCampaign();
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Audiencia' }), 'buyers');
    await user.type(dialog.getAllByPlaceholderText('Sin mínimo')[0]!, '10000');
    await user.type(dialog.getAllByPlaceholderText('Sin mínimo')[1]!, '2');
    await user.type(dialog.getAllByPlaceholderText('—')[0]!, '90');
    await user.type(dialog.getAllByPlaceholderText('—')[1]!, '30');
    await debounce();
    await settle(2);
    expect(body(api, 'POST', '/api/v1/admin/campaigns/audience/preview')).toMatchObject({
      type: 'buyers',
      minSpentMinor: 1_000_000,
      minOrders: 2,
      purchasedWithinDays: 90,
      inactiveForDays: 30,
    });
    expect(dialog.getByText(/42/)).toBeInTheDocument();

    // Productos destacados.
    await user.click(dialog.getByRole('button', { name: 'Agregar' }));
    const picker = within(await screen.findByRole('dialog', { name: 'Agregar productos al email' }));
    await user.type(picker.getByPlaceholderText('Buscar producto…'), product.name.slice(0, 4));
    const row = (await picker.findByText(product.name)).closest('div')!;
    await user.click(within(row).getByRole('button', { name: 'Agregar' }));
    expect(within(row).getByRole('button', { name: 'Agregado' })).toBeDisabled();
    await user.click(picker.getByRole('button', { name: 'Listo' }));
    expect(dialog.getByRole('button', { name: `Quitar ${product.name}` })).toBeInTheDocument();

    // El cupón se busca por código (la lista entera no viene: puede haber miles).
    if (coupon) {
      await user.type(dialog.getByLabelText('Cupón de la campaña'), coupon.code.slice(0, 3));
      await user.click(await dialog.findByRole('option', { name: coupon.code }));
      expect(dialog.getByRole('button', { name: `Sacar el cupón ${coupon.code}` })).toBeInTheDocument();
    }

    await user.click(dialog.getByRole('button', { name: /Guardar borrador/ }));
    await settle(2);
    const saved = body(api, 'PUT', `/api/v1/admin/campaigns/${campaign.id}`);
    expect(saved).toMatchObject({ audience: 'buyers', minSpentMinor: 1_000_000 });
    expect((saved.products as { id: string }[]).map((p) => p.id)).toContain(product.id);
    if (coupon) expect(saved.couponCode).toBe(coupon.code);
  });

  it('selección manual: elige destinatarios uno por uno', async () => {
    const { api, user, dialog } = await openCampaign();
    api.on('POST', '/api/v1/admin/campaigns/audience/preview', {
      count: 2,
      sample: [
        { email: 'ana@example.com', name: 'Ana' },
        { email: 'beto@example.com', name: 'Beto' },
      ],
    });
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Audiencia' }), 'custom');
    await user.click(dialog.getByRole('button', { name: /destinatarios/i }));
    const picker = within(await screen.findByRole('dialog', { name: /Elegir destinatarios/ }));
    await user.type(picker.getByPlaceholderText('Buscar por nombre o email…'), 'ana');
    await settle(2);
    const box = picker.queryAllByRole('checkbox')[0];
    if (box) await user.click(box);
    await user.click(picker.getByRole('button', { name: 'Listo' }));
    await user.click(dialog.getByRole('button', { name: /Guardar borrador/ }));
    await settle(2);
    expect(body(api, 'PUT', `/api/v1/admin/campaigns/${campaign.id}`)).toMatchObject({
      audience: 'custom',
      minSpentMinor: null,
    });
  });

  it('se manda una prueba (con email válido)', async () => {
    const { api, user, dialog } = await openCampaign();
    await user.type(dialog.getByPlaceholderText('tu@email.com'), 'sin-arroba');
    await user.click(dialog.getByRole('button', { name: /Enviar prueba/ }));
    expect(await screen.findByText('Ingresá un email válido.')).toBeInTheDocument();
    await user.clear(dialog.getByPlaceholderText('tu@email.com'));
    await user.type(dialog.getByPlaceholderText('tu@email.com'), 'yo@example.com');
    await user.click(dialog.getByRole('button', { name: /Enviar prueba/ }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/admin/campaigns/${campaign.id}/test`)).toEqual({
      email: 'yo@example.com',
    });
  });

  it('se envía ya (con confirmación que dice a cuántos) o se programa', async () => {
    const { api, user, dialog } = await openCampaign();
    await debounce();
    await settle(2);
    await user.click(dialog.getByRole('button', { name: /^Enviar$|Enviar ahora|Enviar campaña/ }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Enviar campaña' }));
    await user.click(confirm.getByRole('button', { name: /Enviar a/ }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/admin/campaigns/${campaign.id}/send`)).toEqual({ scheduleAtUtc: null });
  });

  it('programarla exige fecha y hora', async () => {
    const { api, user, dialog } = await openCampaign();
    await user.click(dialog.getByRole('button', { name: /Programar/ }));
    fireEvent.change(dialog.getByLabelText('Fecha y hora de envío'), {
      target: { value: '2026-12-01T10:00' },
    });
    // El "Programar" del panel de fecha (el del pie solo lo abre y cierra).
    await user.click(dialog.getAllByRole('button', { name: 'Programar' })[0]!);
    const confirm = within(await screen.findByRole('dialog', { name: 'Programar campaña' }));
    await user.click(confirm.getByRole('button', { name: 'Programar' }));
    await settle(2);
    expect(body(api, 'POST', `/api/v1/admin/campaigns/${campaign.id}/send`).scheduleAtUtc as string).toMatch(
      /^2026-12-01T/,
    );
  });

  it('si el envío falla, lo dice', async () => {
    const { api, user, dialog } = await openCampaign();
    api.on('POST', `/api/v1/admin/campaigns/${campaign.id}/send`, { detail: 'Sin dominio verificado.' }, 400);
    await user.click(dialog.getByRole('button', { name: /^Enviar$|Enviar ahora|Enviar campaña/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Enviar campaña' })).getByRole('button', {
        name: /Enviar a/,
      }),
    );
    // El aviso se ve DENTRO del modal: afuera quedaba debajo del fondo, inerte.
    expect(await screen.findByText('Sin dominio verificado.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Editar campaña' })).toContainElement(
      screen.getByText('Sin dominio verificado.'),
    );
  });

  it('con el asunto cambiado, cerrar pregunta antes de descartar (Cerrar, la X y el fondo)', async () => {
    const { user, dialog, root } = await openCampaign();
    // Sin cambios, cerrar no pregunta… pero primero se cambia el asunto.
    const subject = dialog.getByRole('textbox', { name: 'Asunto' });
    await user.type(subject, ' — último día');
    // El "Cerrar" del pie (el otro es la X del encabezado).
    await user.click(dialog.getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    await user.click(await screen.findByRole('button', { name: 'Seguir editando' }));
    expect(subject).toHaveValue(`${campaign.subject} — último día`);

    await user.click(dialog.getAllByRole('button', { name: 'Cerrar' })[0]!);
    await user.click(await screen.findByRole('button', { name: 'Seguir editando' }));

    // Soltar el mouse afuera después de seleccionar texto del asunto no cierra.
    fireEvent.pointerDown(subject);
    fireEvent.click(root);
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();

    fireEvent.pointerDown(root);
    fireEvent.click(root);
    await user.click(await screen.findByRole('button', { name: 'Descartar' }));
    await settle(2);
    expect(screen.queryByRole('dialog', { name: 'Editar campaña' })).not.toBeInTheDocument();
  });

  it('sin cambios, Cerrar no pregunta', async () => {
    const { user, dialog } = await openCampaign();
    await user.click(dialog.getAllByRole('button', { name: 'Cerrar' }).at(-1)!);
    await settle(2);
    expect(screen.queryByRole('dialog', { name: 'Editar campaña' })).not.toBeInTheDocument();
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });
});

describe('campañas: la lista', () => {
  type Row = { id: string; subject: string; status: string };
  const rows = fixture<{ items: Row[] }>('/api/v1/admin/campaigns').items;
  const draft = rows.find((c) => c.status === 'draft')!;
  const scheduled = rows.find((c) => c.status === 'scheduled')!;
  const sent = rows.find((c) => c.status === 'sent')!;
  const CAMPAIGNS = '/api/v1/admin/campaigns';

  async function openList(setup?: (api: MockApi) => void) {
    const api = mockApi();
    setup?.(api);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/marketing');
    await screen.findByRole('heading', { name: 'Email marketing' }, { timeout: 5000 });
    await settle(2);
    return { api, user };
  }

  const row = (subject: string) =>
    screen.getByText(subject).closest('li, tr, div.rounded-lg, div.rounded-xl') as HTMLElement;
  const confirm = async (name: string) =>
    within(await screen.findByRole('dialog')).getByRole('button', { name });

  it('borrar un borrador (con confirmación) y sus errores', async () => {
    const { api, user } = await openList((a) =>
      a.on('DELETE', `${CAMPAIGNS}/${draft.id}`, { detail: 'Ya se está enviando.' }, 409),
    );
    const del = () => within(row(draft.subject)).getByTitle('Borrar');
    await user.click(del());
    await user.click(await confirm('Cancelar'));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(del());
    await user.click(await confirm('Borrar'));
    expect(await screen.findByText('Ya se está enviando.')).toBeInTheDocument();
    api.on('DELETE', `${CAMPAIGNS}/${draft.id}`, {});
    await user.click(del());
    await user.click(await confirm('Borrar'));
    expect(await screen.findByText('Campaña borrada')).toBeInTheDocument();
  });

  it('cancelar una programada y duplicar una enviada', async () => {
    const { api, user } = await openList((a) => {
      a.on('POST', `${CAMPAIGNS}/${scheduled.id}/cancel`, { detail: 'Ya salió.' }, 409);
      a.on('POST', `${CAMPAIGNS}/${sent.id}/duplicate`, { detail: 'No se pudo.' }, 500);
    });
    await user.click(within(row(scheduled.subject)).getByTitle('Cancelar'));
    expect(await screen.findByText(/vuelve a quedar sin programar/)).toBeInTheDocument();
    // Regresión: el botón de confirmar también decía "Cancelar", igual que el de cerrar.
    await user.click(await confirm('Desprogramar'));
    expect(await screen.findByText('Ya salió.')).toBeInTheDocument();
    api.on('POST', `${CAMPAIGNS}/${scheduled.id}/cancel`, {});
    await user.click(within(row(scheduled.subject)).getByTitle('Cancelar'));
    await user.click(await confirm('Desprogramar'));
    expect(api.calls.filter((c) => c.path === `${CAMPAIGNS}/${scheduled.id}/cancel`)).toHaveLength(2);

    await user.click(within(row(sent.subject)).getByTitle('Duplicar'));
    expect(await screen.findByText('No se pudo.')).toBeInTheDocument();
    api.on('POST', `${CAMPAIGNS}/${sent.id}/duplicate`, {});
    await user.click(within(row(sent.subject)).getByTitle('Duplicar'));
    expect(await screen.findByText('Campaña duplicada como borrador')).toBeInTheDocument();
  });

  it('una campaña enviándose muestra el avance y se puede frenar', async () => {
    const { api, user } = await openList((a) =>
      a.on('GET', CAMPAIGNS, {
        ...fixture<object>(CAMPAIGNS),
        items: [
          {
            ...fixture<{ items: object[] }>(CAMPAIGNS).items[2],
            status: 'sending',
            sentCount: 30,
            failedCount: 2,
            recipientCount: 100,
          },
        ],
        total: 1,
      }),
    );
    expect(await screen.findByText(/30\/100 enviados · 2 fallidos/)).toBeInTheDocument();
    api.on('POST', `${CAMPAIGNS}/${sent.id}/cancel`, {});
    await user.click(screen.getByTitle('Cancelar'));
    expect(await screen.findByText(/Los emails que ya salieron no se pueden deshacer/)).toBeInTheDocument();
    await user.click(await confirm('Frenar el envío'));
    expect(api.calls.some((c) => c.path === `${CAMPAIGNS}/${sent.id}/cancel`)).toBe(true);
  });
});
