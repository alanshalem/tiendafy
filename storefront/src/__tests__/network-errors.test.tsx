/**
 * Sin conexión, los formularios de la cuenta tienen que decirlo y soltar el
 * botón. Antes el fetch rechazado dejaba "cambiar contraseña" girando para
 * siempre, y el de entrar/registrarse le tiraba la excepción a quien llamaba.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ResetPassword } from '../components/store/ResetPassword';
import { useAuth } from '../components/store/auth';
import { mockApi, type MockApi } from '../test/api';
import { nav } from '../test/next';
import { settle } from '../test/explore';
import { renderInStore } from '../test/store';

let api: MockApi;

/** La API responde, salvo `path`: ahí la red se corta. */
function cutNetworkOn(path: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(path)) return Promise.reject(new TypeError('Failed to fetch'));
      return api.fetch(input, init);
    }),
  );
}

beforeEach(() => {
  api = mockApi();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sin conexión', () => {
  it('cambiar la contraseña lo avisa y suelta el botón', async () => {
    cutNetworkOn('/shop/auth/reset');
    nav.at('/cuenta/reset?token=tok-1');
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(<ResetPassword />);
    await settle(2);
    await user.type(screen.getByPlaceholderText('Nueva contraseña'), 'una-clave-larga');
    await user.click(screen.getByRole('button'));
    await settle(1);
    expect(screen.getByText(/No pudimos conectarnos/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('entrar devuelve el error en vez de tirar', async () => {
    cutNetworkOn('/shop/auth/login');
    function Login() {
      const { login } = useAuth();
      const [result, setResult] = useState('');
      return (
        <button
          type="button"
          onClick={() =>
            login('a@b.com', 'una-clave-larga').then(
              (r) => setResult(r.ok ? 'ok' : (r.error ?? '')),
              () => setResult('tiró'),
            )
          }
        >
          {result || 'Entrar'}
        </button>
      );
    }
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(<Login />);
    await settle(2);
    await user.click(screen.getByRole('button'));
    await settle(1);
    expect(screen.getByRole('button')).toHaveTextContent(/No pudimos conectarnos/);
  });
});
