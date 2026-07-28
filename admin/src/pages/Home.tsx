import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Badge, Card } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { Sparkline } from '../components/charts';
import { NoStoreSelected } from '../components/NoStoreSelected';

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

  if (!store) {
    return <NoStoreSelected message="Elegí una tienda arriba para empezar." />;
  }

  const hasProducts = (products?.items.length ?? 0) > 0;

  const steps = [
    {
      done: true,
      title: 'Creaste tu tienda',
      body: `${store.subdomain}.tiendafy.com ya existe.`,
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
      done: false,
      title: 'Personalizá tu tienda',
      body: 'Colores, tipografía y secciones a tu medida. (Pronto)',
      to: '/canales/tienda-online',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg">Hola 👋</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Esto es lo que está pasando en <strong className="text-fg">{store.name}</strong>.
        </p>
      </div>

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
            {overview ? overview.products.total.toLocaleString('es-AR') : '—'}
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
          <div className="mt-1 text-xs text-fg-subtle">Plan {store.plan}</div>
        </Card>
      </div>

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
    </div>
  );
}
