import { useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Link2, Link2Off, Loader2, Store, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  cn,
  EmptyList,
  Input,
  Modal,
  Select,
  Spinner,
  useConfirm,
  useToast,
  type BadgeVariant,
} from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useProductSearch } from '../lib/useProductSearch';
import { moneyMajor } from './mercadolibre-shared';
import type { MoneyDto } from '@tiendafy/types';
import { useServerLoad } from '../lib/useServerLoad';

// ---- Tipos wire --------------------------------------------------------------

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

interface ProductVariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
}

interface ProductDto {
  id: string;
  name: string;
  status: string;
  variants: ProductVariantDto[];
}

const ITEM_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activa', variant: 'success' },
  paused: { label: 'Pausada', variant: 'warning' },
  closed: { label: 'Cerrada', variant: 'neutral' },
  under_review: { label: 'En revisión', variant: 'info' },
};

// ---- Publicaciones -----------------------------------------------------------

export function PublicacionesTab() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<MeliItem[] | null>(null);
  const [linking, setLinking] = useState<MeliItem | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { loading, reload: load } = useServerLoad(
    'publicaciones',
    () => api.get<{ items: MeliItem[] }>('/api/v1/admin/meli/items'),
    (r) => setItems(r.items),
    (err) => {
      toast(errMsg(err, 'No se pudieron cargar las publicaciones.'), { variant: 'error' });
      setItems([]);
    },
  );

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

      {items === null || loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyList>
          No tenés publicaciones en Mercado Libre todavía. Publicá un producto de tu catálogo con el botón de
          arriba.
        </EmptyList>
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
                    <span>{moneyMajor(item.price, 'ARS')}</span>
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
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: found } = useProductSearch<ProductDto>(search);
  const products = found?.items ?? [];
  const product = products.find((p) => p.id === productId);

  // Al elegir un producto con una sola variante, esa queda elegida.
  const choose = (id: string) => {
    setProductId(id);
    const picked = products.find((p) => p.id === id);
    setVariantId(picked?.variants.length === 1 ? picked.variants[0]!.id : '');
  };

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
        <ProductFinder
          search={search}
          onSearch={setSearch}
          products={products}
          selectedId={productId}
          onSelect={choose}
        />
        {product && product.variants.length > 1 && (
          <Select
            aria-label="Variante"
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
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [suggestions, setSuggestions] = useState<
    { categoryId: string | null; categoryName: string | null; domainName: string | null }[] | null
  >(null);
  const [categoryId, setCategoryId] = useState('');
  const [publishing, setPublishing] = useState(false);

  const { data: found } = useProductSearch<ProductDto>(search, { activeOnly: true });
  const products = found?.items ?? [];
  const product = products.find((p) => p.id === productId);

  // Al elegir producto, pedirle a ML la categoría sugerida por el título. Si
  // se elige otro antes de que responda, la respuesta vieja se descarta.
  const lastPick = useRef('');
  const choose = (id: string) => {
    setProductId(id);
    setSuggestions(null);
    setCategoryId('');
    lastPick.current = id;
    const picked = products.find((p) => p.id === id);
    if (!picked) return;
    api
      .get<{
        suggestions: { categoryId: string | null; categoryName: string | null; domainName: string | null }[];
      }>(`/api/v1/admin/meli/categories/predict?title=${encodeURIComponent(picked.name)}`)
      .then((r) => {
        if (lastPick.current !== id) return;
        setSuggestions(r.suggestions);
        if (r.suggestions[0]?.categoryId) setCategoryId(r.suggestions[0].categoryId);
      })
      .catch(() => lastPick.current === id && setSuggestions([]));
  };

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
        <ProductFinder
          search={search}
          onSearch={setSearch}
          products={products}
          selectedId={productId}
          onSelect={choose}
        />
        {product && suggestions === null && (
          <p className="text-sm text-fg-subtle">Buscando la categoría de Mercado Libre…</p>
        )}
        {suggestions && suggestions.length > 0 && (
          <Select
            aria-label="Categoría de Mercado Libre"
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

/**
 * Buscador de producto del catálogo. Antes acá había un desplegable con TODOS
 * los productos: con miles de opciones el navegador se traba y encontrar uno a
 * ojo es imposible. Busca en la base y muestra los primeros que coinciden.
 */
function ProductFinder({
  search,
  onSearch,
  products,
  selectedId,
  onSelect,
}: {
  search: string;
  onSearch: (v: string) => void;
  products: ProductDto[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = products.find((p) => p.id === selectedId);

  return (
    <div>
      <Input
        type="search"
        aria-label="Buscar producto del catálogo"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Buscar producto por nombre o SKU…"
        autoFocus
      />
      {selected && (
        <p className="mt-1.5 text-sm text-fg">
          Elegido: <span className="font-medium">{selected.name}</span>
        </p>
      )}
      <div className="mt-1.5 max-h-52 overflow-y-auto rounded-md border border-border">
        {products.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-fg-muted">
            {search ? 'Ningún producto coincide.' : 'Escribí para buscar en tu catálogo.'}
          </p>
        ) : (
          products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-subtle',
                p.id === selectedId ? 'font-semibold text-primary' : 'text-fg',
              )}
            >
              <span className="truncate">{p.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
