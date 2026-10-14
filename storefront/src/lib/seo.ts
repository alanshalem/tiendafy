import type { Metadata } from 'next';

/**
 * Páginas de una persona (su cuenta, su carrito, sus favoritos) o de uso
 * interno (la vista previa del editor): no tienen nada que buscar en Google.
 * Van con meta robots noindex y NO con un Disallow en robots.txt: si Google
 * no puede entrar, tampoco ve el noindex, y una URL bloqueada pero enlazada
 * igual puede aparecer en los resultados (sin descripción).
 */
export const NOT_INDEXED: Metadata['robots'] = { index: false, follow: false };
