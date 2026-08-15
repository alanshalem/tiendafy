import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Copy,
  Loader2,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Input, Modal, Select, useConfirm, useToast, type BadgeVariant } from '@tiendafy/ui';
import { formatDate, formatMoney } from '../lib/format';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { RichTextEditor } from '../components/RichTextEditor';
import { NotificationUsage } from '../components/NotificationUsage';
import { HelpLink } from '../components/HelpLink';
import { fetchAllProducts } from '../lib/products';
import { EmailPreview } from '../components/EmailPreview';

// ---- Tipos wire --------------------------------------------------------------

interface AudienceSpec {
  type: 'buyers' | 'customers' | 'custom';
  minSpentMinor?: number | null;
  minOrders?: number | null;
  purchasedWithinDays?: number | null;
  inactiveForDays?: number | null;
  emails?: string[] | null;
}

interface CampaignProduct {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  image: string | null;
  slug: string;
}

interface Campaign {
  id: string;
  subject: string;
  bodyHtml: string;
  audience: 'buyers' | 'customers' | 'custom';
  audienceSpec: AudienceSpec;
  couponCode: string | null;
  products: CampaignProduct[];
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  scheduledAtUtc: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAtUtc: string;
  sentAtUtc: string | null;
}

interface AudiencePreview {
  count: number;
  sample: {
    email: string;
    name: string | null;
    spentMinor: number;
    orders: number;
    lastPurchaseUtc: string | null;
  }[];
}

interface CampaignDetail {
  campaign: Campaign;
  stats: {
    sent: number;
    failed: number;
    pending: number;
    opened: number;
    clicked: number;
    unsubs: number;
    estimatedCostUsd: number;
  };
  failedEmails: string[];
  attribution: { orders: number; revenueMinor: number; currency: string; couponCode: string } | null;
}

interface Coupon {
  id: string;
  code: string;
  active: boolean;
}

interface ProductDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  variants: { price: { amount: number; currency: string } }[];
  images: { url: string }[];
}

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  scheduled: { label: 'Programada', variant: 'info' },
  sending: { label: 'Enviando…', variant: 'warning' },
  sent: { label: 'Enviada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};
const DEFAULT_STATUS = STATUS.draft!;

const AUDIENCE_LABEL: Record<string, string> = {
  buyers: 'Compradores',
  customers: 'Todos los contactos',
  custom: 'Selección manual',
};

/**
 * Campañas de email marketing: audiencias segmentadas (gasto/compras/recencia
 * o selección manual), preview brandeada en vivo, cupón con atribución de
 * ingresos, productos embebidos, programación y métricas por campaña.
 */
export function MarketingPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['campaigns', store?.id],
    queryFn: () => api.get<{ items: Campaign[] }>('/api/v1/admin/campaigns'),
    enabled: !!store,
    refetchInterval: (query) =>
      query.state.data?.items.some((c) => c.status === 'sending' || c.status === 'scheduled') ? 5000 : false,
  });
  const items = data?.items ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['campaigns', store?.id] });

  const remove = async (c: Campaign) => {
    const ok = await confirm({
      title: 'Borrar campaña',
      message: `Vas a borrar "${c.subject}". Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/v1/admin/campaigns/${c.id}`);
      toast('Campaña borrada', { variant: 'success' });
      refresh();
    } catch (err) {
      toast(errMsg(err, 'No se pudo borrar.'), { variant: 'error' });
    }
  };

  const cancel = async (c: Campaign) => {
    const ok = await confirm({
      title: c.status === 'scheduled' ? 'Cancelar programación' : 'Cancelar envío',
      message:
        c.status === 'scheduled'
          ? 'La campaña vuelve a quedar sin programar (no se borra).'
          : 'Los emails que ya salieron no se pueden deshacer; se frena lo que falta.',
      confirmLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/api/v1/admin/campaigns/${c.id}/cancel`, {});
      refresh();
    } catch (err) {
      toast(errMsg(err, 'No se pudo cancelar.'), { variant: 'error' });
    }
  };

  const duplicate = async (c: Campaign) => {
    try {
      await api.post(`/api/v1/admin/campaigns/${c.id}/duplicate`, {});
      toast('Campaña duplicada como borrador', { variant: 'success' });
      refresh();
    } catch (err) {
      toast(errMsg(err, 'No se pudo duplicar.'), { variant: 'error' });
    }
  };

  const iconBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg';

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 pb-20">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Marketing</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Campañas de email para tus clientes: novedades, promos, lanzamientos.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Nueva campaña
        </Button>
      </div>

      <NotificationUsage channel="email" />

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-card">
          <Megaphone className="mx-auto h-10 w-10 text-fg-muted" />
          <h3 className="mt-3 text-base font-semibold text-fg">Tu primera campaña</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
            Escribí un email, elegí la audiencia (por ejemplo, todos los que te compraron alguna vez) y
            envialo. Sale con el diseño de tu tienda y link de baja automático.
          </p>
          <Button className="mt-4" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Crear campaña
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const st = STATUS[c.status] ?? DEFAULT_STATUS;
            const editable = c.status === 'draft' || c.status === 'scheduled';
            return (
              <div key={c.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-muted">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-fg">{c.subject}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {c.couponCode && <Badge variant="primary">{c.couponCode}</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-fg-muted">
                      {AUDIENCE_LABEL[c.audience]}
                      {c.status === 'draft' && ` · creada el ${formatDate(c.createdAtUtc)}`}
                      {c.status === 'scheduled' &&
                        c.scheduledAtUtc &&
                        ` · sale el ${new Date(c.scheduledAtUtc).toLocaleString('es-AR')}`}
                      {(c.status === 'sending' || c.status === 'sent') &&
                        ` · ${c.sentCount}/${c.recipientCount} enviados${c.failedCount > 0 ? ` · ${c.failedCount} fallidos` : ''}`}
                    </p>
                    {c.status === 'sending' && c.recipientCount > 0 && (
                      <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.round(((c.sentCount + c.failedCount) / c.recipientCount) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(c.status === 'sent' || c.status === 'sending') && (
                      <button onClick={() => setDetailId(c.id)} title="Métricas" className={iconBtn}>
                        <BarChart3 className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => duplicate(c)} title="Duplicar" className={iconBtn}>
                      <Copy className="h-4 w-4" />
                    </button>
                    {editable && (
                      <button onClick={() => setEditing(c)} title="Editar" className={iconBtn}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {(c.status === 'sending' || c.status === 'scheduled') && (
                      <button onClick={() => cancel(c)} title="Cancelar" className={iconBtn}>
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                    {c.status !== 'sending' && (
                      <button
                        onClick={() => remove(c)}
                        title="Borrar"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-danger hover:bg-danger-bg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <HelpLink id="emailMarketing" />

      {editing && (
        <CampaignModal
          campaign={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {detailId && <DetailModal campaignId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ---- Detalle con métricas ----------------------------------------------------

function DetailModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['campaign-detail', campaignId],
    queryFn: () => api.get<CampaignDetail>(`/api/v1/admin/campaigns/${campaignId}`),
    refetchInterval: (q) => (q.state.data?.campaign.status === 'sending' ? 5000 : false),
  });

  const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—');

  return (
    <Modal open size="lg" onClose={onClose} title={data ? data.campaign.subject : 'Cargando…'}>
      {!data ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
        </div>
      ) : (
        <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Enviados" value={`${data.stats.sent}`} sub={`de ${data.campaign.recipientCount}`} />
            <Stat
              label="Aperturas"
              value={pct(data.stats.opened, data.stats.sent)}
              sub={`${data.stats.opened} (subestimado: hay clientes que bloquean imágenes)`}
            />
            <Stat
              label="Clicks"
              value={pct(data.stats.clicked, data.stats.sent)}
              sub={`${data.stats.clicked}`}
            />
            <Stat
              label="Fallidos"
              value={`${data.stats.failed}`}
              sub={data.stats.pending > 0 ? `${data.stats.pending} pendientes` : ''}
            />
            <Stat label="Bajas de esta campaña" value={`${data.stats.unsubs}`} sub="" />
            <Stat
              label="Costo estimado"
              value={`US$ ${data.stats.estimatedCostUsd.toLocaleString('es-AR')}`}
              sub="tarifa de referencia Resend"
            />
          </div>

          {data.attribution && (
            <div className="rounded-lg border border-success/30 bg-success-bg/40 p-4">
              <div className="text-sm font-semibold text-fg">
                Ventas atribuidas (cupón {data.attribution.couponCode})
              </div>
              <div className="mt-1 text-2xl font-bold text-fg">
                {formatMoney(data.attribution.revenueMinor, data.attribution.currency)}
              </div>
              <div className="text-sm text-fg-muted">
                en {data.attribution.orders} venta{data.attribution.orders === 1 ? '' : 's'} con ese cupón
                desde el envío
              </div>
            </div>
          )}

          {data.failedEmails.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <div className="text-sm font-medium text-fg">Direcciones con fallo</div>
              <p className="mt-1 text-xs text-fg-muted">{data.failedEmails.join(', ')}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight text-fg-subtle">{sub}</div>}
    </div>
  );
}

// ---- Editor de campaña -------------------------------------------------------

function CampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const spec = campaign?.audienceSpec;

  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [body, setBody] = useState(campaign?.bodyHtml ?? '');
  const [audience, setAudience] = useState<'buyers' | 'customers' | 'custom'>(campaign?.audience ?? 'buyers');
  const [minSpent, setMinSpent] = useState(spec?.minSpentMinor ? String(spec.minSpentMinor / 100) : '');
  const [minOrders, setMinOrders] = useState(spec?.minOrders ? String(spec.minOrders) : '');
  const [withinDays, setWithinDays] = useState(
    spec?.purchasedWithinDays ? String(spec.purchasedWithinDays) : '',
  );
  const [inactiveDays, setInactiveDays] = useState(spec?.inactiveForDays ? String(spec.inactiveForDays) : '');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set(spec?.emails ?? []));
  const [couponCode, setCouponCode] = useState(campaign?.couponCode ?? '');
  const [products, setProducts] = useState<CampaignProduct[]>(campaign?.products ?? []);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const buildPayload = () => ({
    subject,
    bodyHtml: body,
    audience,
    minSpentMinor: audience !== 'custom' && minSpent ? Math.round(Number(minSpent) * 100) : null,
    minOrders: audience !== 'custom' && minOrders ? Number(minOrders) : null,
    purchasedWithinDays: audience !== 'custom' && withinDays ? Number(withinDays) : null,
    inactiveForDays: audience !== 'custom' && inactiveDays ? Number(inactiveDays) : null,
    emails: audience === 'custom' ? [...selectedEmails] : null,
    couponCode: couponCode || null,
    products,
  });

  // Conteo de audiencia en vivo (debounced).
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setAudienceCount(null);
      api
        .post<AudiencePreview>('/api/v1/admin/campaigns/audience/preview', {
          type: audience,
          minSpentMinor: audience !== 'custom' && minSpent ? Math.round(Number(minSpent) * 100) : null,
          minOrders: audience !== 'custom' && minOrders ? Number(minOrders) : null,
          purchasedWithinDays: audience !== 'custom' && withinDays ? Number(withinDays) : null,
          inactiveForDays: audience !== 'custom' && inactiveDays ? Number(inactiveDays) : null,
          emails: audience === 'custom' ? [...selectedEmails] : null,
        })
        .then((r) => setAudienceCount(r.count))
        .catch(() => setAudienceCount(null));
    }, 400);
    return () => clearTimeout(t);
  }, [audience, minSpent, minOrders, withinDays, inactiveDays, selectedEmails]);

  // Preview brandeada en vivo (debounced): idéntica al email real.
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .post<{ subject: string; html: string }>('/api/v1/admin/campaigns/preview', {
          subject,
          bodyHtml: body,
          audience,
          products,
        })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [subject, body, products, audience]);

  const { data: couponsData } = useQuery({
    queryKey: ['coupons-for-campaign'],
    queryFn: () => api.get<{ items: Coupon[] }>('/api/v1/coupons'),
  });
  const activeCoupons = (couponsData?.items ?? []).filter((c) => c.active);

  const save = useMutation({
    mutationFn: async () =>
      campaign
        ? api.put<Campaign>(`/api/v1/admin/campaigns/${campaign.id}`, buildPayload())
        : api.post<Campaign>('/api/v1/admin/campaigns', buildPayload()),
  });

  const saveDraft = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        toast('Borrador guardado', { variant: 'success' });
        onSaved();
      },
      onError: (err) => toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' }),
    });

  const sendTest = async () => {
    if (!testEmail.includes('@')) return toast('Ingresá un email válido.', { variant: 'error' });
    setTesting(true);
    try {
      const saved = await save.mutateAsync();
      await api.post(`/api/v1/admin/campaigns/${saved.id}/test`, { email: testEmail.trim() });
      toast(`Prueba enviada a ${testEmail.trim()}`, { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo enviar la prueba.'), { variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const sendCampaign = async (schedule: boolean) => {
    const count = audienceCount ?? 0;
    if (schedule && !scheduleAt) return toast('Elegí fecha y hora.', { variant: 'error' });
    const when = schedule ? new Date(scheduleAt) : null;
    const ok = await confirm({
      title: schedule ? 'Programar campaña' : 'Enviar campaña',
      message: schedule
        ? `"${subject}" se va a enviar el ${when!.toLocaleString('es-AR')} a la audiencia que haya en ese momento (hoy: ${count.toLocaleString('es-AR')}).`
        : `Se va a enviar "${subject}" a ${count.toLocaleString('es-AR')} destinatario${count === 1 ? '' : 's'} (${(AUDIENCE_LABEL[audience] ?? audience).toLowerCase()}). Una vez enviada no se puede deshacer.`,
      confirmLabel: schedule ? 'Programar' : `Enviar a ${count.toLocaleString('es-AR')}`,
    });
    if (!ok) return;
    try {
      const saved = await save.mutateAsync();
      await api.post(`/api/v1/admin/campaigns/${saved.id}/send`, {
        scheduleAtUtc: when ? when.toISOString() : null,
      });
      toast(schedule ? 'Campaña programada.' : 'Campaña en camino: se envía en tandas.', {
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudo enviar la campaña.'), { variant: 'error' });
    }
  };

  const canSend = !save.isPending && !!subject.trim() && !!body.trim();

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={campaign ? 'Editar campaña' : 'Nueva campaña'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="secondary" onClick={saveDraft} disabled={save.isPending}>
            Guardar borrador
          </Button>
          <Button variant="secondary" onClick={() => setShowSchedule((s) => !s)} disabled={!canSend}>
            Programar
          </Button>
          <Button onClick={() => sendCampaign(false)} disabled={!canSend}>
            <Send className="h-4 w-4" /> Enviar ahora
          </Button>
        </>
      }
    >
      <div className="grid h-[72vh] gap-6 lg:grid-cols-2">
        {/* -------- Columna izquierda: edición (única con scroll) -------- */}
        <div className="min-h-0 space-y-4 overflow-y-auto pb-2 pr-2">
          {showSchedule && (
            <div className="flex items-end gap-2 rounded-md border border-info/40 bg-info-bg/40 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-fg">Fecha y hora de envío</label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </div>
              <Button onClick={() => sendCampaign(true)} disabled={!canSend || !scheduleAt}>
                Programar
              </Button>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Asunto</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: ¡Llegó la nueva colección! 🎉"
            />
          </div>

          <AudienceBuilder
            audience={audience}
            setAudience={setAudience}
            minSpent={minSpent}
            setMinSpent={setMinSpent}
            minOrders={minOrders}
            setMinOrders={setMinOrders}
            withinDays={withinDays}
            setWithinDays={setWithinDays}
            inactiveDays={inactiveDays}
            setInactiveDays={setInactiveDays}
            selectedEmails={selectedEmails}
            setSelectedEmails={setSelectedEmails}
            audienceCount={audienceCount}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Contenido</label>
            <RichTextEditor value={body} onChange={setBody} />
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-fg">Productos destacados</div>
              <Button variant="secondary" onClick={() => setShowProductPicker(true)}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
            {products.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-2.5 py-1 text-xs font-medium text-fg"
                  >
                    {p.name}
                    <button
                      onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))}
                      className="text-fg-muted hover:text-danger"
                      aria-label={`Quitar ${p.name}`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-fg-subtle">
              Se muestran como tarjetas con foto, precio y link debajo del contenido.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Cupón de la campaña (opcional)</label>
            <Select
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              options={[
                { value: '', label: 'Sin cupón' },
                ...activeCoupons.map((c) => ({ value: c.code, label: c.code })),
              ]}
            />
            <p className="mt-1 text-xs text-fg-subtle">
              Con cupón, el detalle de la campaña te muestra cuántas ventas y cuánta plata generó.
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="text-sm font-medium text-fg">Enviate una prueba primero</div>
            <div className="mt-2 flex gap-2">
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@email.com"
                className="max-w-xs"
              />
              <Button variant="secondary" onClick={sendTest} disabled={testing || !canSend}>
                {testing && <Loader2 className="h-4 w-4 animate-spin" />} Enviar prueba
              </Button>
            </div>
          </div>
        </div>

        {/* -------- Columna derecha: preview brandeada, fija, sin doble scroll -------- */}
        <div className="flex min-h-0 flex-col">
          <div className="mb-1.5 text-sm font-medium text-fg">Vista previa</div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div className="shrink-0 border-b border-border bg-bg-muted/50 px-4 py-2 text-xs text-fg-muted">
              Asunto:{' '}
              <span className="font-medium text-fg">{preview?.subject || subject || '(sin asunto)'}</span>
            </div>
            <div className="min-h-0 flex-1">
              {preview ? (
                <EmailPreview html={preview.html} />
              ) : (
                <div className="flex h-full items-center justify-center bg-bg-muted/30 text-sm text-fg-muted">
                  Generando vista previa…
                </div>
              )}
            </div>
          </div>
          <p className="mt-1.5 shrink-0 text-xs text-fg-muted">
            Así lo recibe tu cliente: con tu logo, tus colores, los productos y el link de baja.
          </p>
        </div>
      </div>

      {showProductPicker && (
        <ProductPicker
          selected={products}
          onClose={() => setShowProductPicker(false)}
          onAdd={(p) => setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))}
        />
      )}
    </Modal>
  );
}

// ---- Builder de audiencia ----------------------------------------------------

function AudienceBuilder(props: {
  audience: 'buyers' | 'customers' | 'custom';
  setAudience: (a: 'buyers' | 'customers' | 'custom') => void;
  minSpent: string;
  setMinSpent: (v: string) => void;
  minOrders: string;
  setMinOrders: (v: string) => void;
  withinDays: string;
  setWithinDays: (v: string) => void;
  inactiveDays: string;
  setInactiveDays: (v: string) => void;
  selectedEmails: Set<string>;
  setSelectedEmails: (s: Set<string>) => void;
  audienceCount: number | null;
}) {
  const { audience, setAudience, audienceCount } = props;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="rounded-md border border-border p-3">
      <label className="mb-1.5 block text-sm font-medium text-fg">Audiencia</label>
      <Select
        value={audience}
        onChange={(e) => setAudience(e.target.value as 'buyers' | 'customers' | 'custom')}
        options={[
          { value: 'buyers', label: 'Compradores (compraron alguna vez)' },
          { value: 'customers', label: 'Todos los contactos con email' },
          { value: 'custom', label: 'Selección manual' },
        ]}
      />

      {audience !== 'custom' && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-fg-muted">Gastó al menos ($)</label>
            <Input
              value={props.minSpent}
              onChange={(e) => props.setMinSpent(e.target.value)}
              inputMode="numeric"
              placeholder="Sin mínimo"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-fg-muted">Compras mínimas</label>
            <Input
              value={props.minOrders}
              onChange={(e) => props.setMinOrders(e.target.value)}
              inputMode="numeric"
              placeholder="Sin mínimo"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-fg-muted">Compró en los últimos (días)</label>
            <Input
              value={props.withinDays}
              onChange={(e) => props.setWithinDays(e.target.value)}
              inputMode="numeric"
              placeholder="—"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-fg-muted">Sin comprar hace (días)</label>
            <Input
              value={props.inactiveDays}
              onChange={(e) => props.setInactiveDays(e.target.value)}
              inputMode="numeric"
              placeholder="—"
            />
          </div>
        </div>
      )}

      {audience === 'custom' && (
        <div className="mt-2.5">
          <Button variant="secondary" onClick={() => setPickerOpen(true)}>
            <Search className="h-4 w-4" /> Elegir destinatarios ({props.selectedEmails.size})
          </Button>
        </div>
      )}

      <p className="mt-2 text-xs font-medium text-fg-subtle">
        {audienceCount === null
          ? 'Contando destinatarios…'
          : `${audienceCount.toLocaleString('es-AR')} destinatario${audienceCount === 1 ? '' : 's'} (sin contar dados de baja y rebotados)`}
      </p>

      {pickerOpen && (
        <RecipientPicker
          selected={props.selectedEmails}
          onClose={() => setPickerOpen(false)}
          onChange={props.setSelectedEmails}
        />
      )}
    </div>
  );
}

function RecipientPicker({
  selected,
  onClose,
  onChange,
}: {
  selected: Set<string>;
  onClose: () => void;
  onChange: (s: Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const { data } = useQuery({
    queryKey: ['audience-all-contacts'],
    queryFn: () =>
      api.post<AudiencePreview>('/api/v1/admin/campaigns/audience/preview', { type: 'customers' }),
  });
  const all = data?.sample ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((m) => m.email.includes(q) || (m.name ?? '').toLowerCase().includes(q)) : all;
  }, [all, query]);

  const toggle = (email: string) => {
    const next = new Set(selected);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    onChange(next);
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Elegir destinatarios (${selected.size})`}
      footer={<Button onClick={onClose}>Listo</Button>}
    >
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o email…"
      />
      <div className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
        {filtered.map((m) => (
          <label
            key={m.email}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-bg-muted"
          >
            <input type="checkbox" checked={selected.has(m.email)} onChange={() => toggle(m.email)} />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-fg">{m.name ?? m.email}</span>
              {m.name && <span className="ml-2 text-fg-muted">{m.email}</span>}
            </span>
            <span className="shrink-0 text-xs text-fg-subtle">
              {m.orders} compra{m.orders === 1 ? '' : 's'} · {formatMoney(m.spentMinor, 'ARS')}
            </span>
          </label>
        ))}
        {filtered.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">Sin resultados.</p>}
      </div>
    </Modal>
  );
}

// ---- Picker de productos -----------------------------------------------------

function ProductPicker({
  selected,
  onClose,
  onAdd,
}: {
  selected: CampaignProduct[];
  onClose: () => void;
  onAdd: (p: CampaignProduct) => void;
}) {
  const [query, setQuery] = useState('');
  const { data } = useQuery({
    queryKey: ['products-for-campaign'],
    queryFn: () => fetchAllProducts<ProductDto>(),
  });
  const products = useMemo(() => {
    const active = (data ?? []).filter((p) => p.status === 'ACTIVE');
    const q = query.trim().toLowerCase();
    return q ? active.filter((p) => p.name.toLowerCase().includes(q)) : active;
  }, [data, query]);

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Agregar productos al email"
      footer={<Button onClick={onClose}>Listo</Button>}
    >
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" />
      <div className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
        {products.map((p) => {
          const added = selected.some((s) => s.id === p.id);
          const price = p.variants[0]?.price;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-muted">
              {p.images[0]?.url ? (
                <img src={p.images[0].url} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <span className="h-10 w-10 rounded-md bg-bg-muted" />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-fg">{p.name}</span>
                {price && (
                  <span className="ml-2 text-fg-muted">{formatMoney(price.amount, price.currency)}</span>
                )}
              </span>
              <Button
                variant="secondary"
                disabled={added || !price}
                onClick={() =>
                  price &&
                  onAdd({
                    id: p.id,
                    name: p.name,
                    priceMinor: price.amount,
                    currency: price.currency,
                    image: p.images[0]?.url ?? null,
                    slug: p.slug,
                  })
                }
              >
                {added ? 'Agregado' : 'Agregar'}
              </Button>
            </div>
          );
        })}
        {products.length === 0 && (
          <p className="py-6 text-center text-sm text-fg-muted">Sin productos activos.</p>
        )}
      </div>
    </Modal>
  );
}
