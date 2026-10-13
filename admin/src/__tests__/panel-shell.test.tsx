/**
 * El menú del panel en celular: un cajón que se abre con el botón de menú y
 * se cierra al elegir a dónde ir, con Escape o tocando afuera. Antes la barra
 * lateral quedaba fija y se comía dos tercios de la pantalla.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderApp } from '../test/render';

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

async function openPanel(path = '/') {
  mockApi();
  renderApp(path);
  return waitFor(() => screen.getByRole('button', { name: 'Abrir menú' }));
}

describe('menú en celular', () => {
  it('se abre con el botón y se cierra al elegir una página', async () => {
    const u = user();
    const toggle = await openPanel();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('panel-menu')).toHaveClass('invisible');

    await u.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('panel-menu')).not.toHaveClass('invisible');

    await u.click(await screen.findByRole('link', { name: 'Clientes' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('se cierra con Escape o tocando afuera', async () => {
    const u = user();
    const toggle = await openPanel();
    await u.click(toggle);
    await u.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await u.click(toggle);
    await u.click(screen.getByRole('button', { name: 'Cerrar menú' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('Configuración usa el mismo menú', async () => {
    const u = user();
    const toggle = await openPanel('/configuracion/medios-de-pago');
    await u.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: /Medios de envío/ })).toBeInTheDocument();
  });
});
