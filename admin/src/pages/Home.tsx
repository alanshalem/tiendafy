import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Badge, Card } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';

interface ProductsResponse {
  items: unknown[];
  hasMore: boolean;
}

export function HomePage() {
  const { store } = useStore();

  const { data: products } = useQuery({
    queryKey: ['products', store?.id, 'count'],
    queryFn: () => api.get<ProductsResponse>('/api/v1/products?limit=1'),
    enabled: !!store,
  });

  if (!store) {
    return <p className="py-16 text-center text-sm text-fg-muted">Elegí una tienda arriba para empezar.</p>;
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
      done: false,
      title: 'Conectá Mercado Pago',
      body: 'Para cobrar tus ventas directo en tu cuenta. (Pronto)',
      to: '/configuracion',
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
        {[
          { label: 'Ventas hoy', value: '$0', hint: 'El checkout llega pronto' },
          { label: 'Visitas', value: '—', hint: 'Estadísticas en construcción' },
          { label: 'Estado', value: store.status === 'ACTIVE' ? 'Activa' : store.status, hint: `Plan ${store.plan}` },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{stat.label}</div>
            <div className="mt-1 text-2xl font-bold text-fg">{stat.value}</div>
            <div className="mt-1 text-xs text-fg-subtle">{stat.hint}</div>
          </Card>
        ))}
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
              <span className={`block text-sm font-semibold ${step.done ? 'text-fg-muted line-through' : 'text-fg'}`}>
                {step.title}
              </span>
              <span className="block text-xs text-fg-muted">{step.body}</span>
            </span>
            {step.done && <Badge variant="success" className="ml-auto shrink-0">Listo</Badge>}
          </Link>
        ))}
      </Card>
    </div>
  );
}
