/**
 * La barrera de cada pantalla: si una falla al dibujarse, avisa en su lugar
 * —el resto del panel sigue andando— y deja reintentar. Antes no había
 * ninguna y un error en cualquier pantalla dejaba el panel entero en blanco.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenBoundary, isStaleChunk } from '../components/ScreenBoundary';

let fail: Error | null = null;
function Fragile() {
  if (fail) throw fail;
  return <p>Pantalla andando</p>;
}

function Panel() {
  return (
    <MemoryRouter initialEntries={['/a']}>
      <nav>
        <Link to="/b">Otra pantalla</Link>
      </nav>
      <Routes>
        <Route
          path="/a"
          element={
            <ScreenBoundary>
              <Fragile />
            </ScreenBoundary>
          }
        />
        <Route
          path="/b"
          element={
            <ScreenBoundary>
              <p>La otra</p>
            </ScreenBoundary>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
  fail = null;
  vi.restoreAllMocks();
});

describe('barrera de errores de cada pantalla', () => {
  it('si la pantalla falla, avisa en su lugar, el menú sigue y se puede reintentar', async () => {
    const user = userEvent.setup();
    fail = new TypeError('Cannot read properties of undefined');
    render(<Panel />);

    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló en esta pantalla');
    expect(screen.getByRole('link', { name: 'Otra pantalla' })).toBeInTheDocument();

    fail = null;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Pantalla andando')).toBeInTheDocument();
  });

  it('ir a otra pantalla deja atrás el error', async () => {
    const user = userEvent.setup();
    fail = new Error('rota');
    render(<Panel />);
    await user.click(screen.getByRole('link', { name: 'Otra pantalla' }));
    expect(screen.getByText('La otra')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si se publicó una versión nueva del panel, pide recargar en vez de reintentar', () => {
    fail = new TypeError('Failed to fetch dynamically imported module: /assets/Orders-abc123.js');
    render(<Panel />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hay una versión nueva del panel');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(isStaleChunk(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunk(new Error('x is undefined'))).toBe(false);
  });
});
