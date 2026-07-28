import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney } from '../lib/format';
import { ApiRequestError, errMsg } from '../lib/api';

describe('formato compartido', () => {
  it('formatMoney convierte unidades menores a pesos es-AR', () => {
    expect(formatMoney(129900)).toContain('1.299');
    expect(formatMoney(0)).toBeTruthy();
  });

  it('formatDate produce fecha legible', () => {
    expect(formatDate('2026-07-27T12:00:00Z')).toMatch(/2026/);
  });
});

describe('errMsg', () => {
  it('usa el mensaje del API cuando es ApiRequestError', () => {
    const e = new ApiRequestError(403, { code: 'Auth.Forbidden', message: 'No tenés acceso.' });
    expect(errMsg(e)).toBe('No tenés acceso.');
  });

  it('cae al fallback ante errores desconocidos', () => {
    expect(errMsg(new Error('x'), 'Falló')).toBe('Falló');
    expect(errMsg(undefined)).toBe('Error');
  });
});
