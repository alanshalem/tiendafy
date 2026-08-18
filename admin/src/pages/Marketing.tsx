import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Copy, Loader2, Mail, Megaphone, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, Modal, PageHeader, useConfirm, useToast, type BadgeVariant } from '@tiendafy/ui';
import { formatDate, formatMoney } from '../lib/format';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { NotificationUsage } from '../components/NotificationUsage';
import { HelpLink } from '../components/HelpLink';
import { AUDIENCE_LABEL, CampaignModal, type Campaign } from './CampaignModal';

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

export const CAMPAIGN_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  scheduled: { label: 'Programada', variant: 'info' },
  sending: { label: 'Enviando…', variant: 'warning' },
  sent: { label: 'Enviada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};
const DEFAULT_STATUS = CAMPAIGN_STATUS.draft!;

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
      <PageHeader
        className="mb-5"
        title="Email marketing"
        subtitle="Campañas de email para tus clientes: novedades, promos, lanzamientos."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Nueva campaña
          </Button>
        }
      />

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
            const st = CAMPAIGN_STATUS[c.status] ?? DEFAULT_STATUS;
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
