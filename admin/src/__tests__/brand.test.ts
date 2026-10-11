import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * La marca de la instalación.
 *
 * El producto es Tiendafy; una instalación puede llevar la marca de quien la
 * opera ("Puente Oriente") sin recompilar. Lo que se prueba acá es que el
 * reemplazo alcance TODOS los textos de la ayuda: si quedara a medias, el
 * manual le hablaría al usuario de un producto que él no ve en ninguna parte.
 *
 * Los tests corren en node, sin `window`: la config de runtime se simula, que
 * es justo lo que hace el contenedor al escribir config.js.
 */
describe('marca de la instalación', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadWithBrand(brandName?: string) {
    vi.resetModules();
    vi.stubGlobal('window', brandName ? { __TIENDAFY_CONFIG__: { brandName } } : {});
    const { BRAND } = await import('../lib/runtime');
    const { HELP_CONTENT } = await import('../config/helpContent');
    return { BRAND, help: JSON.stringify(HELP_CONTENT) };
  }

  it('sin configurar, es Tiendafy', async () => {
    const { BRAND, help } = await loadWithBrand();

    expect(BRAND).toBe('Tiendafy');
    expect(help).toContain('Tiendafy');
  });

  it('la ayuda entera habla de la marca configurada', async () => {
    const { BRAND, help } = await loadWithBrand('Puente Oriente');

    expect(BRAND).toBe('Puente Oriente');
    expect(help).not.toContain('Tiendafy');
    expect(help).toContain('Puente Oriente');
  });

  it('no renombra rutas, paquetes ni contenedores', async () => {
    const { help } = await loadWithBrand('Puente Oriente');

    // La forma en minúscula es parte de identificadores técnicos de los
    // artículos para desarrolladores (@tiendafy/ui, tiendafy-postgres): esos
    // NO se tocan, o la guía deja de servir para levantar el proyecto.
    expect(help).toContain('tiendafy');
    expect(help).not.toContain('Puente Oriente-postgres');
  });
});
