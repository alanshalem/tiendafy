import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Qué tienda atiende cada dirección.
 *
 * El dominio pelado de esta instalación no es un catálogo de tiendas: es el
 * sitio de la empresa que vende. Eso se consigue con PRIMARY_STORE_SUBDOMAIN,
 * y es la dirección más visitada de todas — si un refactor se lleva puesto ese
 * fallback, la portada del cliente pasa a decir "tienda no encontrada" y nada
 * falla hasta que alguien la abre.
 *
 * Lo otro que se cuida es el borde opuesto: el fallback vale SOLO para el
 * apex. Un subdominio mal escrito tiene que seguir dando "no encontrada" y no
 * servir la tienda principal bajo otra dirección (dos URLs con el mismo
 * contenido es exactamente lo que Google penaliza).
 */

const host = vi.hoisted(() => ({ value: 'localhost:3000' }));
const apiGet = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (n: string) => (n.toLowerCase() === 'host' ? host.value : null) }),
}));
vi.mock('../api', () => ({ apiGet }));

/** Tiendas que existen, indexadas por el host con el que el backend las resuelve. */
const TIENDAS: Record<string, { id: string; name: string }> = {
  'puenteoriente.localhost': { id: '1', name: 'Puente Oriente' },
  'smartfox.localhost': { id: '2', name: 'SmartFox' },
};

async function resolver(h: string) {
  host.value = h;
  const { resolveTenant } = await import('../tenancy');
  return resolveTenant();
}

beforeEach(() => {
  vi.resetModules();
  process.env.PLATFORM_BASE_DOMAIN = 'localhost';
  process.env.PRIMARY_STORE_SUBDOMAIN = 'puenteoriente';
  apiGet.mockImplementation(async (url: string) => {
    const pedido = decodeURIComponent(new URL(url, 'http://x').searchParams.get('host') ?? '');
    return TIENDAS[pedido.split(':')[0]] ?? null;
  });
});

afterEach(() => {
  delete process.env.PRIMARY_STORE_SUBDOMAIN;
  apiGet.mockReset();
});

describe('qué tienda atiende cada dirección', () => {
  it('el dominio pelado sirve la tienda principal', async () => {
    expect(await resolver('localhost:3000')).toMatchObject({ name: 'Puente Oriente' });
  });

  it('el www del dominio pelado también', async () => {
    expect(await resolver('www.localhost:3000')).toMatchObject({ name: 'Puente Oriente' });
  });

  it('cada subdominio sigue sirviendo su propia tienda', async () => {
    expect(await resolver('smartfox.localhost:3000')).toMatchObject({ name: 'SmartFox' });
  });

  it('un subdominio que no existe no cae en la tienda principal', async () => {
    expect(await resolver('noexiste.localhost:3000')).toBeNull();
  });

  it('sin tienda principal declarada, el dominio pelado no inventa una', async () => {
    delete process.env.PRIMARY_STORE_SUBDOMAIN;
    expect(await resolver('localhost:3000')).toBeNull();
  });

  it('el dominio propio de una tienda gana sobre el fallback', async () => {
    // Si alguien carga el dominio pelado como dominio propio de OTRA tienda,
    // manda esa: el fallback es solo para cuando nadie lo reclamó.
    TIENDAS['localhost'] = { id: '9', name: 'La que reclamó el dominio' };
    try {
      expect(await resolver('localhost:3000')).toMatchObject({ name: 'La que reclamó el dominio' });
      expect(apiGet).toHaveBeenCalledTimes(1); // ni siquiera consultó la principal
    } finally {
      delete TIENDAS['localhost'];
    }
  });
});
