import { EmptyState } from '../components/EmptyState';

interface StubConfig {
  kicker: string;
  title: string;
  body: string;
}

/**
 * Páginas de módulos del checklist aún no implementados. La IA completa
 * del panel es navegable desde el día uno; cada stub se reemplaza por la
 * página real cuando su módulo de backend aterriza.
 */
export const stubs: Record<string, StubConfig> = {
  ventas: {
    kicker: 'Ventas',
    title: 'Tu primera venta está por llegar',
    body: 'Desde acá vas a gestionar pedidos, pagos y envíos. Se activa cuando el checkout esté en producción (módulos Orders + Checkout del roadmap).',
  },
  'ventas/carritos': {
    kicker: 'Carritos abandonados',
    title: 'Nada abandonado por ahora',
    body: 'Acá vas a recuperar compras no finalizadas con un click. Llega junto con el checkout.',
  },
  marketing: {
    kicker: 'Marketing',
    title: 'Hacé que te encuentren',
    body: 'Email marketing, recuperación de carritos y promociones, integrado a tu tienda.',
  },
  'canales/redes': {
    kicker: 'Instagram y Facebook',
    title: 'Vendé donde está tu gente',
    body: 'Catálogo sincronizado con Instagram Shopping y Facebook Shops.',
  },
  'canales/google': {
    kicker: 'Google Shopping',
    title: 'Aparecé en las búsquedas',
    body: 'Tus productos en Google Shopping con feed automático.',
  },
  'canales/marketplaces': {
    kicker: 'Marketplaces',
    title: 'Multiplicá tus vidrieras',
    body: 'Publicá en Mercado Libre y otros marketplaces sin duplicar la carga.',
  },
  aplicaciones: {
    kicker: 'Aplicaciones',
    title: 'Un ecosistema para tu tienda',
    body: 'Apps de terceros conectadas por API pública y webhooks. La plataforma de partners es parte del roadmap.',
  },
};

export function StubPage({ id }: { id: keyof typeof stubs }) {
  const config = stubs[id]!;
  return <EmptyState kicker={config.kicker} title={config.title} body={config.body} />;
}
