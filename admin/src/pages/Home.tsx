import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { Badge, Card } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { canAny, usePermissions } from '../context/PermissionsContext';
import { api } from '../lib/api';
import { formatMoney, formatNumber } from '../lib/format';
import { Sparkline } from '../components/charts';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { storefrontHost } from '../lib/storefront';

interface ProductsResponse {
  items: unknown[];
  hasMore: boolean;
}
interface Overview {
  products: { total: number; published: number; draft: number };
}
interface Sales {
  currency: string;
  revenue: number;
  orders: number;
  series: { date: string; revenue: number; orders: number }[];
}

export function HomePage() {
  const { store } = useStore();

  const { data: products } = useQuery({
    queryKey: ['products', store?.id, 'count'],
    queryFn: () => api.get<ProductsResponse>('/api/v1/products?limit=1'),
    enabled: !!store,
  });
  const { data: overview } = useQuery({
    queryKey: ['stats-overview', store?.id],
    queryFn: () => api.get<Overview>('/api/v1/stats/overview'),
    enabled: !!store,
  });
  const { data: sales } = useQuery({
    queryKey: ['stats-sales-30', store?.id],
    queryFn: () => api.get<Sales>('/api/v1/stats/sales?days=30'),
    enabled: !!store,
  });
  const { data: mp } = useQuery({
    queryKey: ['mp-connection', store?.id],
    queryFn: () => api.get<{ connected: boolean }>('/api/v1/payments/mercadopago/connection'),
    enabled: !!store,
  });
  const { data: theme } = useQuery({
    queryKey: ['theme-published', store?.id],
    queryFn: () => api.get<{ logo?: string }>('/api/v1/admin/theme'),
    enabled: !!store,
  });

  if (!store) {
    return <NoStoreSelected message="Elegí una tienda arriba para empezar." />;
  }

  const hasProducts = (products?.items.length ?? 0) > 0;

  const steps = [
    {
      done: true,
      title: 'Creaste tu tienda',
      body: `${storefrontHost(store.subdomain)} ya existe.`,
      to: '/tenants',
    },
    {
      done: hasProducts,
      title: 'Cargá tu primer producto',
      body: 'Con foto, precio y variantes. Es lo que tus clientes van a ver.',
      to: '/productos',
    },
    {
      done: mp?.connected ?? false,
      title: mp?.connected ? 'Mercado Pago conectado' : 'Conectá Mercado Pago',
      body: mp?.connected
        ? 'Ya podés cobrar tus ventas directo en tu cuenta.'
        : 'Para cobrar tus ventas directo en tu cuenta.',
      to: '/configuracion/medios-de-pago',
    },
    {
      done: Boolean(theme?.logo),
      title: 'Personalizá tu tienda',
      body: 'Logo, colores, tipografía y secciones a tu medida.',
      to: '/canales/tienda-online',
    },
  ];

  // Puesta en marcha: sirve al abrir una tienda nueva y estorba el resto del
  // tiempo. Cuando está todo hecho, la tarjeta desaparece sola.
  const pendingSteps = steps.filter((s) => !s.done).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">Hola 👋</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Esto es lo que está pasando en <strong className="text-fg">{store.name}</strong>.
        </p>
      </div>

      <AvisosCard />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Ventas (30 días)</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {sales ? formatMoney(sales.revenue, sales.currency) : '—'}
          </div>
          <div className="mt-1 text-xs text-fg-subtle">
            {sales ? `${sales.orders} ventas pagadas` : 'Cargando…'}
          </div>
          {sales && sales.series.length > 1 && (
            <div className="mt-2">
              <Sparkline data={sales.series.map((s) => s.revenue)} />
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Productos</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {overview ? formatNumber(overview.products.total) : '—'}
          </div>
          <div className="mt-1 text-xs text-fg-subtle">
            {overview
              ? `${overview.products.published} publicados · ${overview.products.draft} borradores`
              : 'Cargando…'}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Estado</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {store.status === 'ACTIVE' ? 'Activa' : store.status}
          </div>
          <div className="mt-1 text-xs text-fg-subtle">
            {store.customDomain ?? storefrontHost(store.subdomain)}
          </div>
        </Card>
      </div>

      {pendingSteps > 0 && (
        <Card title="Poné tu tienda en marcha" flush>
          {steps.map((step, i) => (
            <Link
              key={step.title}
              to={step.to}
              className="flex items-start gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-bg-subtle"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-bold ${
                  step.done
                    ? 'border-success bg-success-bg text-success'
                    : 'border-border-strong text-fg-subtle'
                }`}
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${step.done ? 'text-fg-muted line-through' : 'text-fg'}`}
                >
                  {step.title}
                </span>
                <span className="block text-xs text-fg-muted">{step.body}</span>
              </span>
              {step.done && (
                <Badge variant="success" className="ml-auto shrink-0">
                  Listo
                </Badge>
              )}
            </Link>
          ))}
        </Card>
      )}
      <HelpLink id="primerosPasos" />
    </div>
  );
}

// ---- Avisos accionables ------------------------------------------------------

interface Aviso {
  text: string;
  to: string;
  action: string;
}

/**
 * "El sistema te busca a vos": lo urgente de cada módulo en el Inicio, con su
 * acción — reposición vencida, cuentas sociales caídas, posts fallidos,
 * ventas sin costo cargado. Sin nada que avisar, no se muestra.
 */
function AvisosCard() {
  const { store } = useStore();
  const { can } = usePermissions();

  const canPurchasing = canAny(can, 'purchasing');
  const canSocial = canAny(can, 'social');
  const canStats = canAny(can, 'stats.read');

  const { data: reorder } = useQuery({
    queryKey: ['reorder-suggestions', store?.id, ''],
    queryFn: () => api.get<{ items: unknown[] }>('/api/v1/purchasing/reorder-suggestions'),
    enabled: !!store && canPurchasing,
  });
  const { data: accounts } = useQuery({
    queryKey: ['social-accounts', store?.id],
    queryFn: () => api.get<{ accounts: { authorized: boolean }[] }>('/api/v1/admin/social/accounts'),
    enabled: !!store && canSocial,
  });
  const { data: failedPosts } = useQuery({
    queryKey: ['social-posts-failed', store?.id],
    queryFn: () => api.get<{ posts: unknown[] }>('/api/v1/admin/social/posts?status=Failed'),
    enabled: !!store && canSocial,
  });
  const { data: meliOrders } = useQuery({
    queryKey: ['meli-orders-home', store?.id],
    queryFn: () =>
      api.get<{ items: { status: string; fiscalDocumentId: string | null }[] }>(
        '/api/v1/admin/meli/orders?limit=50',
      ),
    enabled: !!store && canStats,
  });

  const { data: profit } = useQuery({
    queryKey: ['profitability-coverage', store?.id],
    queryFn: () =>
      api.get<{ coverage: { ordersWithCost: number; ordersTotal: number } }>(
        '/api/v1/stats/profitability?days=30',
      ),
    enabled: !!store && canStats,
  });

  const avisos: Aviso[] = [];
  const reorderCount = reorder?.items.length ?? 0;
  if (reorderCount > 0)
    avisos.push({
      text: `${reorderCount} ${reorderCount === 1 ? 'producto se agota' : 'productos se agotan'} antes de que llegue el próximo embarque.`,
      to: '/compras',
      action: 'Ver reposición',
    });
  const deadAccounts = (accounts?.accounts ?? []).filter((a) => !a.authorized).length;
  if (deadAccounts > 0)
    avisos.push({
      text: `${deadAccounts} ${deadAccounts === 1 ? 'cuenta social necesita' : 'cuentas sociales necesitan'} reconectarse — los posts hacia ${deadAccounts === 1 ? 'ella' : 'ellas'} van a fallar.`,
      to: '/redes',
      action: 'Reconectar',
    });
  const failed = failedPosts?.posts.length ?? 0;
  if (failed > 0)
    avisos.push({
      text: `${failed} ${failed === 1 ? 'post salió' : 'posts salieron'} con errores en alguna red.`,
      to: '/redes',
      action: 'Revisar',
    });
  const unbilledMeli = (meliOrders?.items ?? []).filter(
    (o) => o.status === 'paid' && !o.fiscalDocumentId,
  ).length;
  if (unbilledMeli > 0)
    avisos.push({
      text: `${unbilledMeli} ${unbilledMeli === 1 ? 'venta de Mercado Libre pagada sin facturar' : 'ventas de Mercado Libre pagadas sin facturar'}.`,
      to: '/mercadolibre',
      action: 'Facturar',
    });
  if (
    profit &&
    profit.coverage.ordersTotal > 0 &&
    profit.coverage.ordersWithCost < profit.coverage.ordersTotal
  )
    avisos.push({
      text: `${profit.coverage.ordersTotal - profit.coverage.ordersWithCost} de ${profit.coverage.ordersTotal} ventas del mes no tienen costo cargado: la ganancia real se calcula incompleta.`,
      to: '/productos/costos',
      action: 'Cargar costos',
    });

  if (avisos.length === 0) return null;

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <AlertTriangle className="h-4 w-4 text-warning" /> Para hacer hoy
      </h2>
      <ul className="mt-3 space-y-2.5">
        {avisos.map((a) => (
          <li key={a.text} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-fg-muted">{a.text}</span>
            <Link to={a.to} className="shrink-0 font-medium text-primary hover:underline">
              {a.action}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
