/**
 * La API del admin en los tests de componentes: `fetch` responde con las
 * respuestas REALES de la tienda sembrada (ver test-fixtures/mock-api.ts).
 */
import { vi } from 'vitest';
import { createMockApi, type MockApi } from '../../../test-fixtures/mock-api';

export type { ApiCall, MockApi } from '../../../test-fixtures/mock-api';
export { fixture, normalize } from '../../../test-fixtures/mock-api';

/** Instala el fetch simulado para el test. */
export function mockApi(): MockApi {
  const api = createMockApi();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  return api;
}
