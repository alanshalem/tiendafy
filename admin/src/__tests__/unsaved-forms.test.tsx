/**
 * Lo que se escribe en un form no se pierde por un click de más, y lo que no
 * se tocó no pregunta nada.
 *
 * - Los forms en modal comparan contra lo que tenían al abrirse: la X, Escape,
 *   el fondo y su botón Cancelar preguntan solo si algo cambió de verdad.
 * - Las pantallas de Configuración avisan al scope del layout: irse a otra
 *   pantalla con cambios pregunta, y después de guardar ya no.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, Modal } from '@tiendafy/ui';
import { mockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderApp } from '../test/render';
import { useFormDirty, useModalFormGuard } from '../lib/useUnsavedChanges';

function DirtyHarness() {
  const [text, setText] = useState('hola');
  const [round, setRound] = useState(0);
  const dirty = useFormDirty({ text }, round);
  return (
    <>
      <input aria-label="Texto" value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => setRound((r) => r + 1)}>Guardado</button>
      <p>{dirty ? 'con cambios' : 'sin cambios'}</p>
    </>
  );
}

describe('useFormDirty', () => {
  it('compara contra lo inicial: escribir y borrar no es un cambio; otra base, tampoco', async () => {
    const user = userEvent.setup({ delay: null });
    render(<DirtyHarness />);
    const input = screen.getByLabelText('Texto');
    expect(screen.getByText('sin cambios')).toBeInTheDocument();
    await user.type(input, '!');
    expect(screen.getByText('con cambios')).toBeInTheDocument();
    await user.type(input, '{Backspace}');
    expect(screen.getByText('sin cambios')).toBeInTheDocument();

    // Al cambiar la clave (lo guardado), lo que hay pasa a ser la base.
    await user.type(input, ' che');
    await user.click(screen.getByRole('button', { name: 'Guardado' }));
    expect(screen.getByText('sin cambios')).toBeInTheDocument();
  });
});

function GuardedModal() {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('Caja');
  const close = () => setOpen(false);
  const guard = useModalFormGuard({ name }, close);
  return (
    <>
      <p>{open ? 'abierto' : 'cerrado'}</p>
      <Modal open={open} onClose={close} dirty={guard.dirty} title="Cuenta">
        <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={guard.close}>Cancelar</button>
      </Modal>
    </>
  );
}

describe('useModalFormGuard', () => {
  it('sin tocar nada, Cancelar cierra; con cambios, pregunta', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(
      <ConfirmProvider>
        <GuardedModal />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('cerrado')).toBeInTheDocument();
    unmount();

    render(
      <ConfirmProvider>
        <GuardedModal />
      </ConfirmProvider>,
    );
    await user.type(screen.getByLabelText('Nombre'), ' chica');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByText('abierto')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Caja chica');

    // Escape: el navegador dispara "cancel" y el Modal lo frena para preguntar.
    const cancel = new Event('cancel', { cancelable: true });
    act(() => {
      screen.getByRole('dialog', { name: 'Cuenta' }).dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    await user.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(await screen.findByText('cerrado')).toBeInTheDocument();
  });
});

describe('cupones', () => {
  it('crear: el fondo pregunta con algo escrito, y guardar cierra sin preguntar', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/coupons', (body: unknown) => ({ id: 'c-nuevo', ...(body as object) }));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/descuentos');
    await user.click((await screen.findAllByRole('button', { name: /Crear cupón/ }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Crear cupón' });
    await user.type(within(dialog).getByPlaceholderText('VERANO20'), 'otono');

    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(within(dialog).getByPlaceholderText('VERANO20')).toHaveValue('OTONO');

    await user.type(within(dialog).getByPlaceholderText('20'), '15');
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Crear cupón' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });
});

describe('reseñas', () => {
  it('prender y volver a apagar un switch no cuenta como cambio', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/reviews/settings', {
      autoApproveMinRating: 4,
      requestDelayDays: 7,
      showOnStore: true,
      requestEmailEnabled: true,
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/resenas');
    await user.click(await screen.findByRole('button', { name: /Configuración/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Configuración de reseñas' });
    const show = await within(dialog).findByRole('switch', { name: /Mostrar las reseñas/ });
    await user.click(show);
    await user.click(show);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Configuración de reseñas' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });
});

const LEGAL = {
  configured: true,
  legalName: 'Importadora Test S.A.',
  cuit: '30712345671',
  address: 'Av. Siempreviva 742',
  condition: 'RESPONSABLE_INSCRIPTO',
  vatRatePercent: 21,
  otherNationalTaxesPercent: 0,
  showPriceWithoutTaxes: true,
  dataFiscalUrl: null,
  dataFiscalImageUrl: null,
  fromInvoicing: null,
};

describe('pantallas de Configuración', () => {
  it('salir con cambios pregunta; después de guardar, ya no', async () => {
    const api = mockApi();
    let saved: object = LEGAL;
    api.on('GET', '/api/v1/admin/store-legal/', () => saved);
    api.on(
      'PUT',
      '/api/v1/admin/store-legal/',
      (body: unknown) => (saved = { ...LEGAL, ...(body as object) }),
    );
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/configuracion/datos-legales');
    await settle(4);

    const address = screen.getByLabelText('Domicilio');
    await user.type(address, ', CABA');
    await user.click(screen.getByRole('link', { name: 'Redirecciones' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Domicilio')).toHaveValue('Av. Siempreviva 742, CABA');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Redirecciones' }));
    expect(await screen.findByRole('heading', { name: 'Redirecciones' })).toBeInTheDocument();
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });
});
