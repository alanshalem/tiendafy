import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  MessageSquare,
  Send,
  Store,
  Upload,
} from 'lucide-react';
import { Badge, Button, Input, Modal, Select, useConfirm, useToast, type BadgeVariant } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { fetchAllProducts } from '../lib/products';
import { HelpLink } from '../components/HelpLink';

// ---- Tipos wire --------------------------------------------------------------

interface MeliStatus {
  connected: boolean;
  nickname: string | null;
}

interface MeliOrderItem {
  itemId: string;
  variationId: number | null;
  title: string;
  quantity: number;
  unitPrice: number;
  sku: string | null;
}

interface MeliOrder {
  meliOrderId: number;
  packId: number | null;
  status: string;
  dateCreatedUtc: string;
  totalAmount: number;
  paidAmount: number;
  currencyId: string;
  buyerNickname: string;
  buyerId: number;
  items: MeliOrderItem[];
  stockApplied: boolean;
}

interface MeliStats {
  connected: boolean;
  orders: number;
  revenue: number;
  currency: string;
  unitsSold: number;
}

interface MeliQuestion {
  id: number;
  text: string | null;
  status: string | null;
  itemId: string | null;
  dateCreated: string | null;
  answer: { text: string | null; dateCreated: string | null } | null;
}

interface MeliItemLinkDto {
  productId: string;
  variantId: string;
  meliVariationId: number | null;
  syncStock: boolean;
  lastPushedQty: number | null;
}

interface MeliItem {
  id: string;
  title: string | null;
  status: string | null;
  permalink: string | null;
  thumbnail: string | null;
  price: number;
  availableQuantity: number;
  link: MeliItemLinkDto | null;
}

interface MeliClaim {
  id: string;
  status: string | null;
  stage: string | null;
  reasonId: string | null;
  resourceId: string;
  dateCreated: string | null;
}

interface ProductVariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: { amount: number; currency: string };
}

interface ProductDto {
  id: string;
  name: string;
  status: string;
  variants: ProductVariantDto[];
}

// ---- Helpers -----------------------------------------------------------------

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—');

const ORDER_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: 'Pagada', variant: 'success' },
  partially_refunded: { label: 'Reembolso parcial', variant: 'warning' },
  confirmed: { label: 'Confirmada', variant: 'info' },
  payment_required: { label: 'Espera pago', variant: 'warning' },
  payment_in_process: { label: 'Pago en proceso', variant: 'info' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

const ITEM_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activa', variant: 'success' },
  paused: { label: 'Pausada', variant: 'warning' },
  closed: { label: 'Cerrada', variant: 'neutral' },
  under_review: { label: 'En revisión', variant: 'info' },
};

// ---- Página ------------------------------------------------------------------

type Tab = 'ventas' | 'preguntas' | 'publicaciones' | 'reclamos';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'preguntas', label: 'Preguntas' },
  { id: 'publicaciones', label: 'Publicaciones' },
  { id: 'reclamos', label: 'Reclamos' },
];

export function MercadoLibrePage() {
  const { store } = useStore();
  const [status, setStatus] = useState<MeliStatus | null>(null);
  const [tab, setTab] = useState<Tab>('ventas');

  useEffect(() => {
    if (!store) return;
    api
      .get<MeliStatus>('/api/v1/admin/meli/status')
      .then(setStatus)
      .catch(() => setStatus({ connected: false, nickname: null }));
  }, [store]);

  if (!status) return null;

  if (!status.connected) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-bg text-warning">
          <Store className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Mercado Libre</h1>
        <p className="mt-2 text-fg-muted">
          Conectá tu cuenta de vendedor y mirá tus ventas, preguntas y mensajes de Mercado Libre sin salir del
          panel. Vinculando publicaciones, el stock queda unificado.
        </p>
        <Link
          to="/configuracion/mercadolibre"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          Conectar mi cuenta
        </Link>
        <HelpLink id="mercadolibre" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mercado Libre</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Conectado como <span className="font-medium text-fg">{status.nickname}</span>
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5 shadow-card">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ventas' && <VentasTab />}
      {tab === 'preguntas' && <PreguntasTab />}
      {tab === 'publicaciones' && <PublicacionesTab />}
      {tab === 'reclamos' && <ReclamosTab />}

      <HelpLink id="mercadolibre" />
    </div>
  );
}

// ---- Ventas ------------------------------------------------------------------

function VentasTab() {
  const [orders, setOrders] = useState<MeliOrder[] | null>(null);
  const [stats, setStats] = useState<MeliStats | null>(null);
  const [chatOrder, setChatOrder] = useState<MeliOrder | null>(null);

  useEffect(() => {
    api.get<{ items: MeliOrder[] }>('/api/v1/admin/meli/orders?limit=50').then((r) => setOrders(r.items));
    api
      .get<MeliStats>('/api/v1/admin/meli/stats?days=30')
      .then(setStats)
      .catch(() => undefined);
  }, []);

  return (
    <div>
      {stats && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Ventas ML (30 días)" value={String(stats.orders)} />
          <StatCard label="Facturado en ML" value={money(stats.revenue, stats.currency)} />
          <StatCard label="Unidades vendidas" value={String(stats.unitsSold)} />
        </div>
      )}

      {orders === null ? (
        <Cargando />
      ) : orders.length === 0 ? (
        <Vacio texto="Todavía no hay ventas de Mercado Libre. Se importan solas con cada venta nueva (o desde Configuración → Mercado Libre → Importar últimas ventas)." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Comprador</th>
                <th className="px-4 py-3">Productos</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => {
                const st = ORDER_STATUS[o.status] ?? { label: o.status, variant: 'neutral' as BadgeVariant };
                return (
                  <tr key={o.meliOrderId}>
                    <td className="px-4 py-3 text-fg-muted">{fecha(o.dateCreatedUtc)}</td>
                    <td className="px-4 py-3 font-medium text-fg">{o.buyerNickname || '—'}</td>
                    <td className="max-w-[280px] px-4 py-3 text-fg-muted">
                      {o.items.map((i) => `${i.quantity}× ${i.title}`).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-fg">{money(o.totalAmount, o.currencyId)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {o.stockApplied && <Badge variant="info">Stock aplicado</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" onClick={() => setChatOrder(o)}>
                        <MessageSquare className="h-4 w-4" /> Mensajes
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {chatOrder && <MessagesModal order={chatOrder} onClose={() => setChatOrder(null)} />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-fg">{value}</div>
    </div>
  );
}

function MessagesModal({ order, onClose }: { order: MeliOrder; onClose: () => void }) {
  const { toast } = useToast();
  const packId = order.packId ?? order.meliOrderId;
  const [messages, setMessages] = useState<
    { text: string | null; dateCreated: string | null; fromSeller: boolean }[] | null
  >(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ messages: { text: string | null; dateCreated: string | null; fromSeller: boolean }[] }>(
        `/api/v1/admin/meli/packs/${packId}/messages`,
      )
      .then((r) => setMessages(r.messages))
      .catch((err) => {
        toast(errMsg(err, 'No se pudieron cargar los mensajes.'), { variant: 'error' });
        setMessages([]);
      });
  }, [packId, toast]);

  useEffect(load, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/v1/admin/meli/packs/${packId}/messages`, { text: text.trim() });
      setText('');
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo enviar el mensaje.'), { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Chat con ${order.buyerNickname || 'el comprador'}`} size="md">
      <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-lg bg-bg-subtle p-3">
        {messages === null ? (
          <Cargando />
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">
            Sin mensajes. En Mercado Libre la conversación la inicia el comprador.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.fromSeller ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.fromSeller ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-fg'
                }`}
              >
                {m.text}
                <div
                  className={`mt-0.5 text-[10px] ${m.fromSeller ? 'text-primary-fg/70' : 'text-fg-subtle'}`}
                >
                  {fecha(m.dateCreated)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={350}
          placeholder="Escribí tu respuesta (máx. 350 caracteres)…"
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button onClick={send} disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </Modal>
  );
}

// ---- Preguntas ---------------------------------------------------------------

function PreguntasTab() {
  const { toast } = useToast();
  const [soloSinResponder, setSoloSinResponder] = useState(true);
  const [questions, setQuestions] = useState<MeliQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setQuestions(null);
    api
      .get<{ questions: MeliQuestion[] }>(
        `/api/v1/admin/meli/questions${soloSinResponder ? '?status=UNANSWERED' : ''}`,
      )
      .then((r) => setQuestions(r.questions))
      .catch((err) => {
        toast(errMsg(err, 'No se pudieron cargar las preguntas.'), { variant: 'error' });
        setQuestions([]);
      });
  }, [soloSinResponder, toast]);

  useEffect(load, [load]);

  const answer = async (q: MeliQuestion) => {
    const text = (answers[q.id] ?? '').trim();
    if (!text) return;
    setSendingId(q.id);
    try {
      await api.post(`/api/v1/admin/meli/questions/${q.id}/answer`, { text });
      toast('Respuesta publicada en Mercado Libre', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo responder.'), { variant: 'error' });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant={soloSinResponder ? 'primary' : 'secondary'}
          onClick={() => setSoloSinResponder(true)}
        >
          Sin responder
        </Button>
        <Button
          variant={!soloSinResponder ? 'primary' : 'secondary'}
          onClick={() => setSoloSinResponder(false)}
        >
          Todas
        </Button>
      </div>

      {questions === null ? (
        <Cargando />
      ) : questions.length === 0 ? (
        <Vacio
          texto={
            soloSinResponder
              ? '¡Al día! No tenés preguntas sin responder en Mercado Libre.'
              : 'Todavía no recibiste preguntas en Mercado Libre.'
          }
        />
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-fg">{q.text}</p>
                <span className="shrink-0 text-xs text-fg-subtle">{fecha(q.dateCreated)}</span>
              </div>
              {q.answer?.text ? (
                <p className="mt-2 rounded-lg bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
                  <span className="font-medium text-fg">Tu respuesta:</span> {q.answer.text}
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Escribí tu respuesta…"
                    onKeyDown={(e) => e.key === 'Enter' && answer(q)}
                  />
                  <Button
                    onClick={() => answer(q)}
                    disabled={sendingId === q.id || !(answers[q.id] ?? '').trim()}
                  >
                    {sendingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Responder'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Publicaciones -----------------------------------------------------------

function PublicacionesTab() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<MeliItem[] | null>(null);
  const [linking, setLinking] = useState<MeliItem | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(() => {
    setItems(null);
    api
      .get<{ items: MeliItem[] }>('/api/v1/admin/meli/items')
      .then((r) => setItems(r.items))
      .catch((err) => {
        toast(errMsg(err, 'No se pudieron cargar las publicaciones.'), { variant: 'error' });
        setItems([]);
      });
  }, [toast]);

  useEffect(load, [load]);

  const unlink = async (item: MeliItem) => {
    const ok = await confirm({
      title: 'Desvincular publicación',
      message: 'El stock de esta publicación deja de sincronizarse con tu catálogo.',
      confirmLabel: 'Desvincular',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(
        `/api/v1/admin/meli/items/${item.id}/link${item.link?.meliVariationId ? `?variationId=${item.link.meliVariationId}` : ''}`,
      );
      toast('Publicación desvinculada', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desvincular.'), { variant: 'error' });
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setPublishing(true)}>
          <Upload className="h-4 w-4" /> Publicar un producto en ML
        </Button>
      </div>

      {items === null ? (
        <Cargando />
      ) : items.length === 0 ? (
        <Vacio texto="No tenés publicaciones en Mercado Libre todavía. Publicá un producto de tu catálogo con el botón de arriba." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const st = ITEM_STATUS[item.status ?? ''] ?? {
              label: item.status ?? '—',
              variant: 'neutral' as BadgeVariant,
            };
            return (
              <div
                key={item.id}
                className="flex items-center gap-3.5 rounded-lg border border-border bg-surface p-4 shadow-card"
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-subtle">
                    <Store className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{item.title}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
                    <span>{money(item.price, 'ARS')}</span>
                    <span>Stock en ML: {item.availableQuantity}</span>
                    {item.link ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Link2 className="h-3.5 w-3.5" /> Vinculada al catálogo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <Link2Off className="h-3.5 w-3.5" /> Sin vincular (no sincroniza stock)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-fg-subtle hover:text-primary"
                      title="Ver en Mercado Libre"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {item.link ? (
                    <Button variant="secondary" onClick={() => unlink(item)}>
                      Desvincular
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setLinking(item)}>
                      Vincular
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {linking && <LinkModal item={linking} onClose={() => setLinking(null)} onLinked={load} />}
      {publishing && <PublishModal onClose={() => setPublishing(false)} onPublished={load} />}
    </div>
  );
}

function LinkModal({
  item,
  onClose,
  onLinked,
}: {
  item: MeliItem;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAllProducts<ProductDto>().then(setProducts);
  }, []);

  const product = products?.find((p) => p.id === productId);

  useEffect(() => {
    const only = product?.variants.length === 1 ? product.variants[0] : undefined;
    setVariantId(only ? only.id : '');
  }, [product]);

  const save = async () => {
    if (!productId || !variantId) return;
    setSaving(true);
    try {
      await api.post(`/api/v1/admin/meli/items/${item.id}/link`, {
        productId,
        variantId,
        meliVariationId: null,
        title: item.title,
      });
      toast('Publicación vinculada: el stock queda unificado.', { variant: 'success' });
      onLinked();
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo vincular.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Vincular con tu catálogo"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !productId || !variantId}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Vincular
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Elegí qué producto de tu catálogo corresponde a{' '}
        <span className="font-medium text-fg">{item.title}</span>. Una vez vinculado, cada venta en Mercado
        Libre descuenta stock acá, y tu stock se empuja a la publicación.
      </p>
      <div className="mt-4 space-y-3">
        <Select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder={products ? 'Elegí un producto…' : 'Cargando productos…'}
          options={(products ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        {product && product.variants.length > 1 && (
          <Select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="Elegí la variante…"
            options={product.variants.map((v) => ({
              value: v.id,
              label: v.optionValues.join(' / ') || v.sku || 'Única',
            }))}
          />
        )}
      </div>
    </Modal>
  );
}

function PublishModal({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [productId, setProductId] = useState('');
  const [suggestions, setSuggestions] = useState<
    { categoryId: string | null; categoryName: string | null; domainName: string | null }[] | null
  >(null);
  const [categoryId, setCategoryId] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetchAllProducts<ProductDto>().then((all) => setProducts(all.filter((p) => p.status === 'ACTIVE')));
  }, []);

  const product = products?.find((p) => p.id === productId);

  // Al elegir producto, pedirle a ML la categoría sugerida por el título.
  useEffect(() => {
    setSuggestions(null);
    setCategoryId('');
    if (!product) return;
    api
      .get<{
        suggestions: { categoryId: string | null; categoryName: string | null; domainName: string | null }[];
      }>(`/api/v1/admin/meli/categories/predict?title=${encodeURIComponent(product.name)}`)
      .then((r) => {
        setSuggestions(r.suggestions);
        if (r.suggestions[0]?.categoryId) setCategoryId(r.suggestions[0].categoryId);
      })
      .catch(() => setSuggestions([]));
  }, [product]);

  const publish = async () => {
    if (!product || !categoryId) return;
    setPublishing(true);
    try {
      const res = await api.post<{ itemId: string; permalink: string | null }>(
        `/api/v1/admin/meli/products/${product.id}/publish`,
        { categoryId },
      );
      toast(`¡Publicado en Mercado Libre! (${res.itemId})`, { variant: 'success' });
      onPublished();
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo publicar.'), { variant: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Publicar en Mercado Libre"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={publish} disabled={publishing || !product || !categoryId}>
            {publishing && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Se crea una publicación nueva con el título, precio, fotos, descripción y stock del producto, ya
        vinculada para sincronizar stock. Los productos con variantes se publican con su primera variante (el
        resto se puede vincular a mano).
      </p>
      <div className="mt-4 space-y-3">
        <Select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder={products ? 'Elegí un producto activo…' : 'Cargando productos…'}
          options={(products ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        {product && suggestions === null && (
          <p className="text-sm text-fg-subtle">Buscando la categoría de Mercado Libre…</p>
        )}
        {suggestions && suggestions.length > 0 && (
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={suggestions
              .filter((s): s is typeof s & { categoryId: string } => !!s.categoryId)
              .map((s) => ({
                value: s.categoryId,
                label: `${s.categoryName ?? s.categoryId}${s.domainName ? ` · ${s.domainName}` : ''}`,
              }))}
          />
        )}
        {suggestions && suggestions.length === 0 && (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" /> Mercado Libre no sugirió una categoría para ese título —
            probá con un nombre más descriptivo.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---- Reclamos ----------------------------------------------------------------

function ReclamosTab() {
  const [claims, setClaims] = useState<MeliClaim[] | null>(null);

  useEffect(() => {
    api
      .get<{ claims: MeliClaim[] }>('/api/v1/admin/meli/claims')
      .then((r) => setClaims(r.claims))
      .catch(() => setClaims([]));
  }, []);

  return claims === null ? (
    <Cargando />
  ) : claims.length === 0 ? (
    <Vacio texto="Sin reclamos abiertos en Mercado Libre. 🎉" />
  ) : (
    <div className="space-y-3">
      {claims.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-fg">Reclamo #{c.id}</span>
              <Badge variant="warning">{c.status ?? '—'}</Badge>
              {c.stage && <Badge variant="neutral">{c.stage}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-fg-muted">
              {c.reasonId ? `Motivo: ${c.reasonId} · ` : ''}Venta {c.resourceId} · {fecha(c.dateCreated)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Comunes -----------------------------------------------------------------

function Cargando() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted">
      {texto}
    </div>
  );
}
