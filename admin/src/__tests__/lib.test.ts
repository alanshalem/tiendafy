import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { ApiRequestError, errMsg } from '../lib/api';

describe('formato compartido', () => {
  it('formatMoney convierte unidades menores a pesos es-AR', () => {
    expect(formatMoney(129900)).toContain('1.299');
    expect(formatMoney(0)).toBeTruthy();
  });

  it('formatNumber agrupa miles al estilo argentino', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234.5, { maximumFractionDigits: 0 })).toBe('1.235');
  });

  it('formatNumber da exactamente lo que daba toLocaleString(es-AR)', () => {
    // Reemplazó ochenta llamadas sueltas: la salida tiene que ser idéntica.
    for (const n of [0, 7, 999, 1000, 54321, 1234567.89, -42]) {
      expect(formatNumber(n)).toBe(n.toLocaleString('es-AR'));
    }
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

  // Regresión: un 500 vacío o un 502 del proxy mostraban "Request failed with status 502".
  it('si el servidor no explicó el error, usa el mensaje de la pantalla', () => {
    const e = new ApiRequestError(
      502,
      { code: 'HTTP.502', message: 'Request failed with status 502' },
      false,
    );
    expect(errMsg(e, 'No se pudieron traer los compradores.')).toBe('No se pudieron traer los compradores.');
  });
});
