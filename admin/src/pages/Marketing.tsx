import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Megaphone, Pencil, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, Input, Modal, Select, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { RichTextEditor } from '../components/RichTextEditor';
import { NotificationUsage } from '../components/NotificationUsage';
import { HelpLink } from '../components/HelpLink';

interface Campaign {
  id: string;
  subject: string;
  bodyHtml: string;
  audience: 'buyers' | 'customers';
  status: 'draft' | 'sending' | 'sent' | 'cancelled';
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAtUtc: string;
  sentAtUtc: string | null;
}

const STATUS: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Borrador', variant: 'neutral' },
  sending: { label: 'Enviando…', variant: 'warning' },
  sent: { label: 'Enviada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};
const DEFAULT_STATUS = STATUS.draft!;

const AUDIENCE_LABEL: Record<string, string> = {
  buyers: 'Compradores',
  customers: 'Todos los contactos',
};

/**
 * Campañas de email marketing. El envío corre en background por lotes; la
 * lista se refresca sola mientras haya una campaña en curso. Todo email de
 * campaña sale con link de baja y la audiencia respeta la lista de supresión.
 */
export function MarketingPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);

  const { data } = useQuery({
    queryKey: ['campaigns', store?.id],
    queryFn: () => api.get<{ items: Campaign[] }>('/api/v1/admin/campaigns'),
    enabled: !!store,
    refetchInterval: (query) => (query.state.data?.items.some((c) => c.status === 'sending') ? 5000 : false),
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
      title: 'Cancelar envío',
      message: 'Los emails que ya salieron no se pueden deshacer; se frena lo que falta.',
      confirmLabel: 'Cancelar envío',
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 pb-20">
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
                    </div>
                    <p className="mt-0.5 text-sm text-fg-muted">
                      {AUDIENCE_LABEL[c.audience]} ·{' '}
                      {c.status === 'draft'
                        ? `creada el ${new Date(c.createdAtUtc).toLocaleDateString('es-AR')}`
                        : `${c.sentCount}/${c.recipientCount} enviados${c.failedCount > 0 ? ` · ${c.failedCount} fallidos` : ''}`}
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
                    {c.status === 'draft' && (
                      <>
                        <button
                          onClick={() => setEditing(c)}
                          title="Editar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          title="Borrar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-danger hover:bg-danger-bg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {c.status === 'sending' && (
                      <button
                        onClick={() => cancel(c)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-fg hover:bg-bg-muted"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancelar
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
    </div>
  );
}

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
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [body, setBody] = useState(campaign?.bodyHtml ?? '');
  const [audience, setAudience] = useState<'buyers' | 'customers'>(campaign?.audience ?? 'buyers');
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setAudienceCount(null);
    api
      .get<{ count: number }>(`/api/v1/admin/campaigns/audience-count?type=${audience}`)
      .then((r) => alive && setAudienceCount(r.count))
      .catch(() => alive && setAudienceCount(null));
    return () => {
      alive = false;
    };
  }, [audience]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { subject, bodyHtml: body, audience };
      return campaign
        ? api.put<Campaign>(`/api/v1/admin/campaigns/${campaign.id}`, payload)
        : api.post<Campaign>('/api/v1/admin/campaigns', payload);
    },
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

  const sendCampaign = async () => {
    const count = audienceCount ?? 0;
    const ok = await confirm({
      title: 'Enviar campaña',
      message: `Se va a enviar "${subject}" a ${count.toLocaleString('es-AR')} destinatario${count === 1 ? '' : 's'} (${(AUDIENCE_LABEL[audience] ?? audience).toLowerCase()}). Una vez enviada no se puede deshacer.`,
      confirmLabel: `Enviar a ${count.toLocaleString('es-AR')}`,
    });
    if (!ok) return;
    try {
      const saved = await save.mutateAsync();
      await api.post(`/api/v1/admin/campaigns/${saved.id}/send`, {});
      toast('Campaña en camino: se envía en tandas, podés seguir el progreso acá.', {
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudo enviar la campaña.'), { variant: 'error' });
    }
  };

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
          <Button onClick={sendCampaign} disabled={save.isPending || !subject.trim() || !body.trim()}>
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </>
      }
    >
      <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Asunto</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: ¡Llegó la nueva colección! 🎉"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Audiencia</label>
            <Select
              value={audience}
              onChange={(e) => setAudience(e.target.value as 'buyers' | 'customers')}
              options={[
                { value: 'buyers', label: 'Compradores (compraron alguna vez)' },
                { value: 'customers', label: 'Todos los contactos con email' },
              ]}
            />
            <p className="mt-1 text-xs text-fg-subtle">
              {audienceCount === null
                ? 'Contando destinatarios…'
                : `${audienceCount.toLocaleString('es-AR')} destinatario${audienceCount === 1 ? '' : 's'} (sin contar los dados de baja)`}
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">Contenido</label>
          <RichTextEditor value={body} onChange={setBody} />
          <p className="mt-1.5 text-xs text-fg-subtle">
            Sale con el diseño de tu tienda (logo y color) y con el link de baja obligatorio al pie.
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
            <Button
              variant="secondary"
              onClick={sendTest}
              disabled={testing || !subject.trim() || !body.trim()}
            >
              {testing && <Loader2 className="h-4 w-4 animate-spin" />} Enviar prueba
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
