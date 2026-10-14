import { useEffect, useMemo, useState, useId } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Search, Send, X, XCircle } from 'lucide-react';
import { Button, Checkbox, Input, Modal, Select, useConfirm, useToast, Spinner } from '@tiendafy/ui';
import { formatMoney, formatNumber } from '../lib/format';
import { api, errMsg } from '../lib/api';
import { RichTextEditor } from '../components/RichTextEditor';
import { useProductSearch, useProductsByIds } from '../lib/useProductSearch';
import { EmailPreviewPanel } from '../components/EmailPreview';
import type { MoneyDto } from '@tiendafy/types';
import { parseMoneyInput } from '../lib/price';
import { useBeforeUnload, useGuardedClose } from '../lib/useUnsavedChanges';
import { AUDIENCE_LABEL } from './marketing-constants';

// ---- Tipos wire --------------------------------------------------------------

interface AudienceSpec {
  type: 'buyers' | 'customers' | 'subscribers' | 'custom';
  boughtProductIds?: string[] | null;
  favoritedProductIds?: string[] | null;
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

export interface Campaign {
  id: string;
  subject: string;
  bodyHtml: string;
  audience: 'buyers' | 'customers' | 'subscribers' | 'custom';
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
  variants: { price: MoneyDto }[];
  images: { url: string }[];
}

// ---- Editor de campaña -------------------------------------------------------

export function CampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fid = useId();
  const { toast } = useToast();
  const confirm = useConfirm();
  const spec = campaign?.audienceSpec;

  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [body, setBody] = useState(campaign?.bodyHtml ?? '');
  const [audience, setAudience] = useState<'buyers' | 'customers' | 'subscribers' | 'custom'>(
    campaign?.audience ?? 'buyers',
  );
  const [minSpent, setMinSpent] = useState(spec?.minSpentMinor ? String(spec.minSpentMinor / 100) : '');
  const [minOrders, setMinOrders] = useState(spec?.minOrders ? String(spec.minOrders) : '');
  const [withinDays, setWithinDays] = useState(
    spec?.purchasedWithinDays ? String(spec.purchasedWithinDays) : '',
  );
  const [inactiveDays, setInactiveDays] = useState(spec?.inactiveForDays ? String(spec.inactiveForDays) : '');
  // Segmentación por catálogo: a los que compraron esto, o a los que lo tienen
  // en favoritos (la lista con más intención de compra de la tienda).
  const [boughtIds, setBoughtIds] = useState<string[]>(spec?.boughtProductIds ?? []);
  const [favoritedIds, setFavoritedIds] = useState<string[]>(spec?.favoritedProductIds ?? []);
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
    minSpentMinor: audience !== 'custom' && minSpent ? parseMoneyInput(minSpent) : null,
    minOrders: audience !== 'custom' && minOrders ? Number(minOrders) : null,
    purchasedWithinDays: audience !== 'custom' && withinDays ? Number(withinDays) : null,
    inactiveForDays: audience !== 'custom' && inactiveDays ? Number(inactiveDays) : null,
    emails: audience === 'custom' ? [...selectedEmails] : null,
    boughtProductIds: audience !== 'custom' && boughtIds.length ? boughtIds : null,
    favoritedProductIds: audience !== 'custom' && favoritedIds.length ? favoritedIds : null,
    couponCode: couponCode || null,
    products,
  });

  // Lo que había al abrir: el asunto y el cuerpo (texto con formato, el que
  // más cuesta rehacer) y la audiencia no se pierden por un click afuera.
  const [opened] = useState(() => JSON.stringify(buildPayload()));
  const dirty = JSON.stringify(buildPayload()) !== opened;
  const close = useGuardedClose(dirty, onClose);
  useBeforeUnload(dirty);

  // Conteo de audiencia en vivo (debounced).
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setAudienceCount(null);
      api
        .post<AudiencePreview>('/api/v1/admin/campaigns/audience/preview', {
          type: audience,
          minSpentMinor: audience !== 'custom' && minSpent ? parseMoneyInput(minSpent) : null,
          minOrders: audience !== 'custom' && minOrders ? Number(minOrders) : null,
          purchasedWithinDays: audience !== 'custom' && withinDays ? Number(withinDays) : null,
          inactiveForDays: audience !== 'custom' && inactiveDays ? Number(inactiveDays) : null,
          emails: audience === 'custom' ? [...selectedEmails] : null,
          boughtProductIds: audience !== 'custom' && boughtIds.length ? boughtIds : null,
          favoritedProductIds: audience !== 'custom' && favoritedIds.length ? favoritedIds : null,
        })
        // Sin un número (respuesta distinta a la esperada) se queda en "contando":
        // formatear undefined rompía el modal entero.
        .then((r) => setAudienceCount(typeof r.count === 'number' ? r.count : null))
        .catch(() => setAudienceCount(null));
    }, 400);
    return () => clearTimeout(t);
  }, [audience, minSpent, minOrders, withinDays, inactiveDays, selectedEmails, boughtIds, favoritedIds]);

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
    // Cada uso (borrador, prueba, envío) avisa el error con su propio mensaje.
    meta: { errorShown: true },
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
        ? `"${subject}" se va a enviar el ${when!.toLocaleString('es-AR')} a la audiencia que haya en ese momento (hoy: ${formatNumber(count)}).`
        : `Se va a enviar "${subject}" a ${formatNumber(count)} destinatario${count === 1 ? '' : 's'} (${(AUDIENCE_LABEL[audience] ?? audience).toLowerCase()}). Una vez enviada no se puede deshacer.`,
      confirmLabel: schedule ? 'Programar' : `Enviar a ${formatNumber(count)}`,
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
      dirty={dirty}
      title={campaign ? 'Editar campaña' : 'Nueva campaña'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
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
                <label htmlFor={`${fid}-1`} className="mb-1 block text-xs font-medium text-fg">
                  Fecha y hora de envío
                </label>
                <Input
                  id={`${fid}-1`}
                  aria-label="Fecha y hora de envío"
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
            <label htmlFor={`${fid}-2`} className="mb-1.5 block text-sm font-medium text-fg">
              Asunto
            </label>
            <Input
              id={`${fid}-2`}
              aria-label="Asunto"
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
            boughtIds={boughtIds}
            setBoughtIds={setBoughtIds}
            favoritedIds={favoritedIds}
            setFavoritedIds={setFavoritedIds}
            selectedEmails={selectedEmails}
            setSelectedEmails={setSelectedEmails}
            audienceCount={audienceCount}
          />

          <div>
            <p id={`${fid}-contenido`} className="mb-1.5 block text-sm font-medium text-fg">
              Contenido
            </p>
            <RichTextEditor labelledBy={`${fid}-contenido`} value={body} onChange={setBody} />
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
            <label htmlFor={`${fid}-3`} className="mb-1.5 block text-sm font-medium text-fg">
              Cupón de la campaña (opcional)
            </label>
            <Select
              id={`${fid}-3`}
              aria-label="Cupón de la campaña"
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
            <label htmlFor={`${fid}-prueba`} className="text-sm font-medium text-fg">
              Enviate una prueba primero
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id={`${fid}-prueba`}
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@email.com"
                className="max-w-xs"
              />
              <Button variant="secondary" onClick={sendTest} disabled={testing || !canSend}>
                {testing && <Spinner inline />} Enviar prueba
              </Button>
            </div>
          </div>
        </div>

        {/* -------- Columna derecha: preview brandeada, fija, sin doble scroll -------- */}
        <EmailPreviewPanel
          subject={subject}
          preview={preview}
          caption="Así lo recibe tu cliente: con tu logo, tus colores, los productos y el link de baja."
        />
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
  audience: 'buyers' | 'customers' | 'subscribers' | 'custom';
  setAudience: (a: 'buyers' | 'customers' | 'subscribers' | 'custom') => void;
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
  boughtIds: string[];
  setBoughtIds: (v: string[]) => void;
  favoritedIds: string[];
  setFavoritedIds: (v: string[]) => void;
  audienceCount: number | null;
}) {
  const fid = useId();
  const { audience, setAudience, audienceCount } = props;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="rounded-md border border-border p-3">
      <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
        Audiencia
      </label>
      <Select
        id={`${fid}-1`}
        aria-label="Audiencia"
        value={audience}
        onChange={(e) => setAudience(e.target.value as 'buyers' | 'customers' | 'subscribers' | 'custom')}
        options={[
          { value: 'buyers', label: 'Compradores (compraron alguna vez)' },
          { value: 'customers', label: 'Todos los contactos con email' },
          { value: 'subscribers', label: 'Suscriptores a novedades' },
          { value: 'custom', label: 'Selección manual' },
        ]}
      />

      {audience !== 'custom' && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${fid}-2`} className="mb-1 block text-xs text-fg-muted">
              Gastó al menos ($)
            </label>
            <Input
              id={`${fid}-2`}
              aria-label="Gastó al menos ($)"
              value={props.minSpent}
              onChange={(e) => props.setMinSpent(e.target.value)}
              inputMode="numeric"
              placeholder="Sin mínimo"
            />
          </div>
          <div>
            <label htmlFor={`${fid}-3`} className="mb-1 block text-xs text-fg-muted">
              Compras mínimas
            </label>
            <Input
              id={`${fid}-3`}
              aria-label="Compras mínimas"
              value={props.minOrders}
              onChange={(e) => props.setMinOrders(e.target.value)}
              inputMode="numeric"
              placeholder="Sin mínimo"
            />
          </div>
          <div>
            <label htmlFor={`${fid}-4`} className="mb-1 block text-xs text-fg-muted">
              Compró en los últimos (días)
            </label>
            <Input
              id={`${fid}-4`}
              aria-label="Compró en los últimos (días)"
              value={props.withinDays}
              onChange={(e) => props.setWithinDays(e.target.value)}
              inputMode="numeric"
              placeholder="—"
            />
          </div>
          <div>
            <label htmlFor={`${fid}-5`} className="mb-1 block text-xs text-fg-muted">
              Sin comprar hace (días)
            </label>
            <Input
              id={`${fid}-5`}
              aria-label="Sin comprar hace (días)"
              value={props.inactiveDays}
              onChange={(e) => props.setInactiveDays(e.target.value)}
              inputMode="numeric"
              placeholder="—"
            />
          </div>
        </div>
      )}

      {audience !== 'custom' && (
        <div className="mt-2.5 space-y-2">
          <ProductFilterRow
            label="Compró alguno de estos productos"
            hint="La campaña de proteína, a los que compran proteína."
            selected={props.boughtIds}
            onChange={props.setBoughtIds}
          />
          <ProductFilterRow
            label="Lo tiene en favoritos"
            hint="Marcaron el corazón y todavía no lo compraron: la lista con más intención de compra."
            selected={props.favoritedIds}
            onChange={props.setFavoritedIds}
          />
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
          : `${formatNumber(audienceCount)} destinatario${audienceCount === 1 ? '' : 's'} (sin contar dados de baja y rebotados)`}
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

/**
 * Filtro de audiencia por catálogo: se eligen productos y la campaña sale solo
 * para quien los compró (o los tiene en favoritos). Reusa el mismo buscador de
 * productos que los destacados del email.
 */
function ProductFilterRow({
  label,
  hint,
  selected,
  onChange,
}: {
  label: string;
  hint: string;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data } = useProductSearch<ProductDto>(search);
  const products = data?.items ?? [];

  // Los elegidos se resuelven por id: pueden no estar en la búsqueda actual.
  // Se filtra por `selected` porque la respuesta puede ser la de la selección
  // anterior mientras llega la nueva (ver useProductsByIds).
  const { data: chosenData } = useProductsByIds<ProductDto>(selected);
  const chosen = (chosenData?.items ?? []).filter((p) => selected.includes(p.id));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-fg">{label}</p>
          <p className="text-xs text-fg-subtle">{hint}</p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          <Search className="h-4 w-4" /> Elegir ({selected.length})
        </Button>
      </div>

      {chosen.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chosen.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(selected.filter((id) => id !== p.id))}
              className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5 text-xs text-fg hover:bg-danger-bg hover:text-danger"
              title="Quitar del filtro"
            >
              {p.name} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-1.5 rounded-md border border-border">
          <div className="border-b border-border p-1.5">
            <Input
              compact
              type="search"
              aria-label={`Buscar producto: ${label.toLowerCase()}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              autoFocus
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {products.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-fg-muted">
                {search ? 'Ningún producto coincide.' : 'Escribí para buscar.'}
              </p>
            )}
            {products.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    onChange(checked ? selected.filter((id) => id !== p.id) : [...selected, p.id])
                  }
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-bg-subtle ${
                    checked ? 'font-semibold text-primary' : 'text-fg'
                  }`}
                >
                  {checked ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
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
  const all = useMemo(() => data?.sample ?? [], [data]);
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
        type="search"
        aria-label="Buscar destinatarios por nombre o email"
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
            <Checkbox checked={selected.has(m.email)} onChange={() => toggle(m.email)} />
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
  const { data } = useProductSearch<ProductDto>(query, { activeOnly: true });
  const products = data?.items ?? [];

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Agregar productos al email"
      footer={<Button onClick={onClose}>Listo</Button>}
    >
      <Input
        type="search"
        aria-label="Buscar productos para el email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar producto…"
      />
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
