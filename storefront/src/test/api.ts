/**
 * La API en los tests del storefront: `fetch` (del server y del browser)
 * responde con las respuestas REALES de la tienda sembrada (ver
 * test-fixtures/mock-api.ts). La tienda se resuelve por host, como en
 * producción: `/tenants/resolve` devuelve la tienda de las fixtures.
 */
import { vi } from 'vitest';
import { createMockApi, fixture, fixtureTenantId, type MockApi } from '../../../test-fixtures/mock-api';

export type { ApiCall, MockApi } from '../../../test-fixtures/mock-api';
export { fixture, fixtureTenantId, normalize } from '../../../test-fixtures/mock-api';

/** Instala el fetch simulado, con la tienda sembrada resolviendo por host. */
export function mockApi(): MockApi {
  const api = createMockApi();
  api.on('GET', '/api/v1/tenants/resolve', fixture(`/api/v1/tenants/${fixtureTenantId}`));
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  return api;
}
