import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { Badge, Card, PageHeader } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { api } from '../lib/api';
import { formatMoney, formatNumber } from '../lib/format';
import { Sparkline } from '../components/charts';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { HelpLink } from '../components/HelpLink';
import { storefrontHost, storePublicHost } from '../lib/storefront';
import { InlineSkeleton } from '../components/Skeleton';

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
  const { can } = usePermissions();
  // Cada tarjeta pide lo suyo solo si la persona lo puede ver: sin esto, a
  // alguien de catálogo o de soporte el Inicio le tiraba un 403 por tarjeta.
  const canStats = can('stats.read');

  const { data: products } = useQuery({
    queryKey: ['products', store?.id, 'count'],
    queryFn: () => api.get<ProductsResponse>('/api/v1/products?limit=1'),
    enabled: !!store,
  });
  const { data: overview } = useQuery({
    queryKey: ['stats-overview', store?.id],
    queryFn: () => api.get<Overview>('/api/v1/stats/overview'),
    enabled: !!store && canStats,
  });
  const { data: sales } = useQuery({
    queryKey: ['stats-sales-30', store?.id],
    queryFn: () => api.get<Sales>('/api/v1/stats/sales?days=30'),
    enabled: !!store && canStats,
  });
  const { data: mp } = useQuery({
    queryKey: ['mp-connection', store?.id],
    queryFn: () => api.get<{ connected: boolean }>('/api/v1/payments/mercadopago/connection'),
    enabled: !!store && can('payments.read'),
  });
  const { data: theme } = useQuery({
    queryKey: ['theme-published', store?.id],
    // La config publicada (la misma que ve el comprador): tiene el logo.
    queryFn: () => api.get<{ logo?: string }>('/api/v1/theme'),
    enabled: !!store && can('content.write'),
  });

  if (!store) {
    return <NoStoreSelected message="Elegí una tienda arriba para empezar." />;
  }

  const hasProducts = (products?.items.length ?? 0) > 0;

  // Los pasos que la persona puede hacer: no tiene sentido mandar a alguien de
  // soporte a conectar Mercado Pago.
  const steps = [
    {
      done: true,
      title: 'Creaste tu tienda',
      body: `${storefrontHost(store.subdomain)} ya existe.`,
      to: '/tenants',
      allowed: true,
    },
    {
      allowed: can('catalog.write'),
      done: hasProducts,
      title: 'Cargá tu primer producto',
      body: 'Con foto, precio y variantes. Es lo que tus clientes van a ver.',
      to: '/productos',
    },
    {
      allowed: can('payments.write'),
      done: mp?.connected ?? false,
      title: mp?.connected ? 'Mercado Pago conectado' : 'Conectá Mercado Pago',
      body: mp?.connected
        ? 'Ya podés cobrar tus ventas directo en tu cuenta.'
        : 'Para cobrar tus ventas directo en tu cuenta.',
      to: '/configuracion/medios-de-pago',
    },
    {
      allowed: can('content.write'),
      done: Boolean(theme?.logo),
      title: 'Personalizá tu tienda',
      body: 'Logo, colores, tipografía y secciones a tu medida.',
      to: '/canales/tienda-online',
    },
  ].filter((s) => s.allowed);

  // Puesta en marcha: sirve al abrir una tienda nueva y estorba el resto del
  // tiempo. Cuando está todo hecho, la tarjeta desaparece sola.
  const pendingSteps = steps.filter((s) => !s.done).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hola 👋"
        subtitle={
          <>
            Esto es lo que está pasando en <strong className="text-fg">{store.name}</strong>.
          </>
        }
      />

      <AvisosCard />

      <div className="grid gap-4 sm:grid-cols-3">
        {canStats && (
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Ventas (30 días)
            </div>
            <div className="mt-1 text-2xl font-bold text-fg">
              {sales ? formatMoney(sales.revenue, sales.currency) : '—'}
            </div>
            <div className="mt-1 text-xs text-fg-subtle">
              {sales ? `${sales.orders} ventas pagadas` : <InlineSkeleton label="Cargando ventas…" />}
            </div>
            {sales && sales.series.length > 1 && (
              <div className="mt-2">
                <Sparkline data={sales.series.map((s) => s.revenue)} />
              </div>
            )}
          </Card>
        )}
        {canStats && (
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Productos</div>
            <div className="mt-1 text-2xl font-bold text-fg">
              {overview ? formatNumber(overview.products.total) : '—'}
            </div>
            <div className="mt-1 text-xs text-fg-subtle">
              {overview ? (
                `${overview.products.published} publicados · ${overview.products.draft} borradores`
              ) : (
                <InlineSkeleton label="Cargando productos…" />
              )}
            </div>
          </Card>
        )}
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Estado</div>
          <div className="mt-1 text-2xl font-bold text-fg">
            {store.status === 'ACTIVE' ? 'Activa' : store.status}
          </div>
          <div className="mt-1 text-xs text-fg-subtle">{storePublicHost(store)}</div>
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
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-3xs font-bold ${
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
  /** Tiene plazo legal o vence pronto: va arriba y en rojo. */
  urgent?: boolean;
}

/** Lo que devuelve /home/todo: cada cola en null si la persona no la puede ver. */
interface HomeTodo {
  toDispatch: number | null;
  pendingTransfers: number | null;
  messages: { unreadContact: number; repentance: number; oldestRepentanceAtUtc: string | null } | null;
  mercadoLibre: { unbilled: number; unanswered: number | null } | null;
  fiscalReady: boolean | null;
}

/**
 * Plazo con el que el panel pide atender un arrepentimiento: los mismos 10
 * días corridos que la Resolución 424/2020 le da al comprador para revocar.
 * La norma no fija un plazo exacto para que el comercio devuelva la plata,
 * pero exige no demorarlo; 10 días es la vara para que ninguno quede colgado.
 */
export const REPENTANCE_DAYS = 10;

/** Días que quedan desde la solicitud más vieja (negativo = vencido). */
export function repentanceDaysLeft(oldestAtUtc: string, now = Date.now()): number {
  const elapsed = Math.floor((now - new Date(oldestAtUtc).getTime()) / 86_400_000);
  return REPENTANCE_DAYS - elapsed;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Las colas del día, en el orden en que conviene atenderlas; cada una lleva a su listado filtrado. */
function todoAvisos(todo: HomeTodo | undefined): Aviso[] {
  if (!todo) return [];
  const out: Aviso[] = [];
  const m = todo.messages;
  if (m && m.repentance > 0) {
    const left = m.oldestRepentanceAtUtc ? repentanceDaysLeft(m.oldestRepentanceAtUtc) : REPENTANCE_DAYS;
    const plazo =
      left > 1
        ? `quedan ${left} días para resolver la más vieja`
        : left === 1
          ? 'queda 1 día para resolver la más vieja'
          : left === 0
            ? 'la más vieja vence hoy'
            : `la más vieja está vencida hace ${n(-left, 'día', 'días')}`;
    out.push({
      text: `${n(m.repentance, 'arrepentimiento sin atender', 'arrepentimientos sin atender')} (plazo legal): ${plazo}.`,
      to: '/mensajes?filtro=repentance',
      action: 'Atender',
      urgent: true,
    });
  }
  if (todo.toDispatch && todo.toDispatch > 0)
    out.push({
      text: `${n(todo.toDispatch, 'venta cobrada para despachar', 'ventas cobradas para despachar')}.`,
      to: '/ventas?estado=PAID',
      action: 'Despachar',
    });
  if (todo.pendingTransfers && todo.pendingTransfers > 0)
    out.push({
      text: `${n(todo.pendingTransfers, 'transferencia por confirmar', 'transferencias por confirmar')}: revisá si entró la plata.`,
      to: '/ventas?estado=PENDINGPAYMENT&cobro=transfer',
      action: 'Revisar',
    });
  const ml = todo.mercadoLibre;
  if (ml?.unanswered && ml.unanswered > 0)
    out.push({
      text: `${n(ml.unanswered, 'pregunta de Mercado Libre sin responder', 'preguntas de Mercado Libre sin responder')}.`,
      to: '/mercadolibre?tab=preguntas',
      action: 'Responder',
    });
  if (m && m.unreadContact > 0)
    out.push({
      text: `${n(m.unreadContact, 'mensaje de contacto sin leer', 'mensajes de contacto sin leer')}.`,
      to: '/mensajes',
      action: 'Leer',
    });
  if (ml && ml.unbilled > 0) {
    // Mientras la facturación no esté lista, "Facturar" solo daría error.
    const ready = todo.fiscalReady !== false;
    out.push({
      text: `${n(ml.unbilled, 'venta de Mercado Libre pagada sin facturar', 'ventas de Mercado Libre pagadas sin facturar')}${ready ? '' : ': antes hay que terminar de configurar la facturación'}.`,
      to: ready ? '/mercadolibre?tab=ventas&estado=sin-facturar' : '/configuracion/facturacion',
      action: ready ? 'Facturar' : 'Configurá la facturación',
    });
  }
  return out;
}

/**
 * "El sistema te busca a vos": lo urgente de cada módulo en el Inicio, con su
 * acción — reposición vencida, cuentas sociales caídas, posts fallidos,
 * ventas sin costo cargado. Sin nada que avisar, no se muestra.
 */
function AvisosCard() {
  const { store } = useStore();
  const { can } = usePermissions();

  const canPurchasing = can('purchasing.manage');
  const canSocial = can('social.publish');

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
  // Las colas del día, contadas en la base (antes "ML sin facturar" salía de
  // las últimas 50 ventas y se clavaba en 50).
  const { data: todo } = useQuery({
    queryKey: ['home-todo', store?.id],
    queryFn: () => api.get<HomeTodo>('/api/v1/home/todo'),
    enabled: !!store && (can('orders.read') || can('messages.read') || can('meli.operate')),
    retry: false,
  });

  const { data: profit } = useQuery({
    queryKey: ['profitability-coverage', store?.id],
    queryFn: () =>
      api.get<{ coverage: { ordersWithCost: number; ordersTotal: number } }>(
        '/api/v1/stats/profitability?days=30',
      ),
    enabled: !!store && can('costs.read'),
  });

  const avisos: Aviso[] = todoAvisos(todo);
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
            <span className={a.urgent ? 'font-medium text-danger' : 'text-fg-muted'}>{a.text}</span>
            <Link to={a.to} className="shrink-0 font-medium text-primary hover:underline">
              {a.action}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
