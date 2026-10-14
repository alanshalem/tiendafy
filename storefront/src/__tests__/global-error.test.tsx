/**
 * Si falla el layout raíz, error.tsx no alcanza (vive adentro). global-error
 * reemplaza al documento entero: en castellano, con "Reintentar".
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from '../app/global-error';

afterEach(() => vi.restoreAllMocks());

describe('global-error', () => {
  it('explica y deja reintentar', async () => {
    // <html> dentro del contenedor de jsdom: React avisa del anidamiento.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const retry = vi.fn();
    render(<GlobalError error={new Error('layout caído')} retry={retry} />);
    expect(screen.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
