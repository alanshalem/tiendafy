import type { Metadata } from 'next';
import { resolveTenant } from './tenancy';

/**
 * Páginas de una persona (su cuenta, su carrito, sus favoritos) o de uso
 * interno (la vista previa del editor): no tienen nada que buscar en Google.
 * Van con meta robots noindex y NO con un Disallow en robots.txt: si Google
 * no puede entrar, tampoco ve el noindex, y una URL bloqueada pero enlazada
 * igual puede aparecer en los resultados (sin descripción).
 */
export const NOT_INDEXED: Metadata['robots'] = { index: false, follow: false };

/**
 * El título de una sección con páginas adentro (la cuenta, el checkout). Un
 * título fijo en el layout de la sección cortaba la plantilla del layout
 * raíz para las de adentro ("Pago aprobado" salía sin la tienda), así que
 * la sección repite la plantilla. El default, en cambio, va pelado: a ese
 * Next ya le aplica la plantilla del layout raíz ("Mi cuenta · Tienda").
 */
export async function sectionTitle(name: string): Promise<Metadata['title']> {
  const tenant = await resolveTenant().catch(() => null);
  return tenant ? { template: `%s · ${tenant.name}`, default: name } : name;
}
