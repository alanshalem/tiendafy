import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ExternalLink, Search } from 'lucide-react';
import { Badge, Button, Input, Select, Spinner, Textarea, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import {
  missingLabel,
  type AiCatalogApproveBody,
  type AiCatalogAttributeInput,
  type AiCatalogCategory,
  type AiCatalogItem,
  type AiCatalogMissing,
} from '../../lib/aiCatalog';
import { qk } from '../../lib/queryKeys';
import { useDebouncedValue } from '../../lib/useDebouncedValue';

/** Lo que la persona fue completando de un dato que falta: el valor elegido o escrito, y la unidad. */
interface Filled {
  valueId?: string;
  text?: string;
  unit?: string;
}

/**
 * Una ficha de la revisión. Según su estado: lo actual al lado de lo propuesto (con descripción y SEO editables) y los
 * datos que le faltan para Mercado Libre; elegir la categoría; o, ya aprobada, mandarla a la publicación de ML.
 * Cada acción refresca el trabajo y, al aprobar, también el producto en el catálogo.
 */
export function AiCatalogItemCard({ item, canPublish }: { item: AiCatalogItem; canPublish: boolean }) {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.aiCatalog(store?.id) });

  const discard = useMutation({
    mutationFn: () => api.post(`/api/v1/ai/catalog/items/${item.id}/discard`, {}),
    onSuccess: () => {
      toast('Ficha descartada. No se guardó nada.', { variant: 'success' });
      return refresh();
    },
    onError: (err) => toast(errMsg(err, 'No se pudo descartar.'), { variant: 'error' }),
  });

  return (
    <article
      aria-label={`Ficha de ${item.current.name}`}
      className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-fg">{item.current.name}</h3>
          {item.category && (
            <p className="text-xs text-fg-muted">Categoría de Mercado Libre: {item.category.name}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/productos/${item.productId}/editar`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ver el producto <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
          {item.status === 'Review' && <Verdict item={item} />}
        </div>
      </header>

      {item.status === 'Review' && item.proposal && (
        <ReviewBody
          item={item}
          onApproved={refresh}
          onDiscard={() => discard.mutate()}
          discarding={discard.isPending}
        />
      )}
      {item.status === 'NeedsCategory' && (
        <CategoryPicker
          item={item}
          onChosen={refresh}
          onDiscard={() => discard.mutate()}
          discarding={discard.isPending}
        />
      )}
      {item.status === 'Approved' && <ApprovedBody item={item} canPublish={canPublish} />}
      {item.status === 'Failed' && (
        <div className="space-y-2">
          <p role="alert" className="flex items-start gap-1.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {item.failureReason ?? 'No se pudo armar la ficha de este producto.'}
          </p>
          <Button variant="secondary" size="sm" onClick={() => discard.mutate()} loading={discard.isPending}>
            Descartar
          </Button>
        </div>
      )}
      {item.status === 'Discarded' && (
        <p className="text-sm text-fg-muted">Descartada: no se guardó nada de esta ficha.</p>
      )}
    </article>
  );
}

function Verdict({ item }: { item: AiCatalogItem }) {
  return item.passed ? (
    <Badge variant="success">Pasó la evaluación</Badge>
  ) : (
    <Badge variant="warning">Revisala bien{item.score !== null ? ` · puntaje ${item.score} de 5` : ''}</Badge>
  );
}

// ------------------------------------------------------------------ Para revisar

function ReviewBody({
  item,
  onApproved,
  onDiscard,
  discarding,
}: {
  item: AiCatalogItem;
  onApproved: () => unknown;
  onDiscard: () => void;
  discarding: boolean;
}) {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const proposal = item.proposal!;
  const [description, setDescription] = useState(proposal.description);
  const [seoTitle, setSeoTitle] = useState(proposal.seoTitle);
  const [seoDescription, setSeoDescription] = useState(proposal.seoDescription);
  const [filled, setFilled] = useState<Record<string, Filled>>({});

  const approve = useMutation({
    mutationFn: () => {
      const body: AiCatalogApproveBody = {
        description,
        seoTitle,
        seoDescription,
        attributes: item.missing.flatMap((m) => {
          const input = attributeInput(m, filled[m.attributeId]);
          return input ? [input] : [];
        }),
      };
      return api.post(`/api/v1/ai/catalog/items/${item.id}/approve`, body);
    },
    onSuccess: async () => {
      toast('Ficha guardada en tu tienda. Mercado Libre no cambia hasta que lo actualices.', {
        variant: 'success',
      });
      await Promise.all([
        onApproved(),
        queryClient.invalidateQueries({ queryKey: qk.products(store?.id) }),
        queryClient.invalidateQueries({ queryKey: qk.product(store?.id, item.productId) }),
      ]);
    },
    onError: (err) => toast(errMsg(err, 'No se pudo aprobar la ficha.'), { variant: 'error' }),
  });

  const notes = (item.judgeNotes ?? '').split('\n').filter((n) => n.trim() !== '');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Lo que tiene hoy" className="space-y-2 text-sm">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Ahora</h4>
          <p className="whitespace-pre-line text-fg">
            {item.current.description?.trim() ? (
              item.current.description
            ) : (
              <span className="text-fg-subtle">Sin descripción.</span>
            )}
          </p>
          <dl className="space-y-1 text-xs text-fg-muted">
            <div>
              <dt className="inline font-medium">Título SEO: </dt>
              <dd className="inline">{item.current.seoTitle || 'sin cargar'}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Descripción SEO: </dt>
              <dd className="inline">{item.current.seoDescription || 'sin cargar'}</dd>
            </div>
            {item.current.brand && (
              <div>
                <dt className="inline font-medium">Marca: </dt>
                <dd className="inline">{item.current.brand}</dd>
              </div>
            )}
            {item.current.specs.map((s) => (
              <div key={s.name}>
                <dt className="inline font-medium">{s.name}: </dt>
                <dd className="inline">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Lo que propone la IA" className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">Propuesta de la IA</h4>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-fg">Descripción</span>
            <Textarea rows={7} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-fg">Título SEO</span>
            <Input value={seoTitle} maxLength={60} onChange={(e) => setSeoTitle(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-fg">Descripción SEO</span>
            <Textarea
              rows={2}
              value={seoDescription}
              maxLength={160}
              onChange={(e) => setSeoDescription(e.target.value)}
            />
          </label>
          {proposal.attributes.length > 0 && (
            <ul aria-label="Datos de la ficha" className="space-y-1 text-sm">
              {proposal.attributes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-fg-muted">{a.name}:</span>
                  <span className="font-medium text-fg">{a.value}</span>
                  <Badge variant={a.target === 'spec' ? 'primary' : 'neutral'}>
                    {a.target === 'spec' ? 'Ficha de la tienda' : 'Solo Mercado Libre'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!item.passed && notes.length > 0 && (
        <div role="note" className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm">
          <p className="font-medium text-fg">Lo que marcó el evaluador:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {item.missing.length > 0 && (
        <fieldset className="space-y-3 rounded-md border border-border bg-bg-subtle p-3">
          <legend className="px-1 text-sm font-semibold text-fg">Le falta para Mercado Libre</legend>
          <p className="text-xs text-fg-muted">
            La IA no inventa estos datos: si no están en tu producto, quedan para que los completes vos. Podés
            dejarlos vacíos y aprobar igual.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {item.missing.map((m) => (
              <MissingField
                key={m.attributeId}
                missing={m}
                value={filled[m.attributeId]}
                onChange={(v) => setFilled((prev) => ({ ...prev, [m.attributeId]: v }))}
              />
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={onDiscard} loading={discarding} disabled={approve.isPending}>
          Descartar
        </Button>
        <Button onClick={() => approve.mutate()} loading={approve.isPending} disabled={discarding}>
          <Check className="h-4 w-4" aria-hidden /> Aprobar
        </Button>
      </div>
    </div>
  );
}

/** El dato de ML que la persona completó, como lo espera el servidor; null si lo dejó vacío. */
function attributeInput(m: AiCatalogMissing, filled: Filled | undefined): AiCatalogAttributeInput | null {
  if (!filled) return null;
  if (m.kind === 'List' || m.kind === 'Boolean') {
    const chosen = m.values.find((v) => v.id === filled.valueId);
    return chosen ? { id: m.attributeId, valueId: chosen.id, valueName: chosen.name } : null;
  }
  const text = filled.text?.trim();
  if (!text) return null;
  if (m.kind === 'NumberUnit') {
    return { id: m.attributeId, valueName: text, unit: filled.unit ?? m.defaultUnit ?? undefined };
  }
  return { id: m.attributeId, valueName: text };
}

/** Un campo para completar a mano, según el tipo de dato: lista, sí/no, número con unidad, número o texto. */
function MissingField({
  missing: m,
  value,
  onChange,
}: {
  missing: AiCatalogMissing;
  value: Filled | undefined;
  onChange: (value: Filled) => void;
}) {
  const label = missingLabel(m);

  if (m.kind === 'List' || m.kind === 'Boolean') {
    return (
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <Select
          value={value?.valueId ?? ''}
          onChange={(e) => onChange({ valueId: e.target.value })}
          placeholder="Elegí una opción…"
          options={m.values.map((v) => ({ value: v.id, label: v.name }))}
        />
      </label>
    );
  }

  if (m.kind === 'NumberUnit') {
    return (
      <div className="space-y-1 text-sm">
        <label htmlFor={`m-${m.attributeId}`} className="font-medium text-fg">
          {label}
        </label>
        <div className="flex gap-2">
          <Input
            id={`m-${m.attributeId}`}
            inputMode="decimal"
            value={value?.text ?? ''}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
          />
          {m.units.length > 0 && (
            <Select
              aria-label={`Unidad de ${m.name}`}
              className="w-28"
              value={value?.unit ?? m.defaultUnit ?? m.units[0]}
              onChange={(e) => onChange({ ...value, unit: e.target.value })}
              options={m.units.map((u) => ({ value: u, label: u }))}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-fg">{label}</span>
      <Input
        inputMode={m.kind === 'Number' ? 'decimal' : undefined}
        value={value?.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
      />
    </label>
  );
}

// ------------------------------------------------------------------ Elegí la categoría

/**
 * Las sugerencias de la predicción de Mercado Libre y un buscador. Elegir una devuelve la ficha a la cola: el worker la
 * retoma con esa categoría y la IA recién entonces entra en juego.
 */
function CategoryPicker({
  item,
  onChosen,
  onDiscard,
  discarding,
}: {
  item: AiCatalogItem;
  onChosen: () => unknown;
  onDiscard: () => void;
  discarding: boolean;
}) {
  const { store } = useStore();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), 350);

  const search = useQuery({
    queryKey: ['ai-catalog', store?.id, 'category-search', query],
    queryFn: () =>
      api.get<{ suggestions: { categoryId: string; categoryName: string; domainName: string | null }[] }>(
        `/api/v1/ai/catalog/categories/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: !!store && query.length >= 3,
  });

  const choose = useMutation({
    mutationFn: (categoryId: string) =>
      api.put(`/api/v1/ai/catalog/items/${item.id}/category`, { categoryId }),
    onSuccess: () => {
      toast('Categoría elegida. La ficha vuelve a la cola.', { variant: 'success' });
      return onChosen();
    },
    onError: (err) => toast(errMsg(err, 'No se pudo elegir la categoría.'), { variant: 'error' }),
  });

  const found: AiCatalogCategory[] = (search.data?.suggestions ?? []).map((s) => ({
    id: s.categoryId,
    name: s.domainName ? `${s.categoryName} · ${s.domainName}` : s.categoryName,
  }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Mercado Libre no tiene clara la categoría de este producto. Elegí una para que la IA complete los
        datos que esa categoría pide; hasta entonces no se gasta nada.
      </p>
      {item.suggestions.length > 0 && (
        <div role="group" aria-label="Categorías sugeridas" className="flex flex-wrap gap-2">
          {item.suggestions.map((s) => (
            <CategoryButton
              key={s.id}
              category={s}
              onChoose={(id) => choose.mutate(id)}
              busy={choose.isPending}
            />
          ))}
        </div>
      )}
      <div className="space-y-2">
        <label className="relative block">
          <span className="sr-only">Buscar otra categoría</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <Input
            className="pl-9"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar otra categoría (ej: taladro percutor)…"
          />
        </label>
        {search.isFetching && (
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <Spinner inline size={12} /> Buscando…
          </p>
        )}
        {search.isError && (
          <p role="alert" className="text-xs text-danger">
            {errMsg(search.error, 'No se pudo buscar.')}
          </p>
        )}
        {found.length > 0 && (
          <div role="group" aria-label="Resultados de la búsqueda" className="flex flex-wrap gap-2">
            {found.map((s) => (
              <CategoryButton
                key={s.id}
                category={s}
                onChoose={(id) => choose.mutate(id)}
                busy={choose.isPending}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onDiscard} loading={discarding}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

function CategoryButton({
  category,
  onChoose,
  busy,
}: {
  category: AiCatalogCategory;
  onChoose: (id: string) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onChoose(category.id)}
      className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
    >
      {category.name}
    </button>
  );
}

// ------------------------------------------------------------------ Aprobada

function ApprovedBody({ item, canPublish }: { item: AiCatalogItem; canPublish: boolean }) {
  const { toast } = useToast();
  const push = useMutation({
    mutationFn: () =>
      api.post<{ updatedListings: number }>(`/api/v1/ai/catalog/items/${item.id}/push-to-meli`, {}),
    onSuccess: ({ updatedListings }) =>
      toast(
        updatedListings === 1
          ? 'Se actualizó la publicación en Mercado Libre.'
          : `Se actualizaron ${updatedListings} publicaciones en Mercado Libre.`,
        { variant: 'success' },
      ),
    onError: (err) => toast(errMsg(err, 'No se pudo actualizar en Mercado Libre.'), { variant: 'error' }),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="flex items-center gap-1.5 text-success">
        <Check className="h-4 w-4" aria-hidden /> Aprobada y guardada en tu tienda.
      </p>
      {canPublish && item.hasMeliListing && (
        <Button variant="secondary" size="sm" onClick={() => push.mutate()} loading={push.isPending}>
          Actualizar la ficha en ML
        </Button>
      )}
    </div>
  );
}
