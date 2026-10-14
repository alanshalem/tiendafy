import { useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button, Input, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { SETTINGS_CARD, SETTINGS_COLUMNS } from '../../lib/styles';
import { useServerLoad } from '../../lib/useServerLoad';

interface SearchSettings {
  synonyms: string[][];
  isDefault: boolean;
  updatedAt: string | null;
  defaults: string[][];
}

interface QueryRow {
  term: string;
  count: number;
  results: number;
}

interface Queries {
  top: QueryRow[];
  withoutResults: QueryRow[];
}

/** Un renglón editable: el grupo como lo escribe el comercio, con comas. */
interface Row {
  key: number;
  text: string;
}

const toRows = (groups: string[][], start = 0): Row[] =>
  groups.map((g, i) => ({ key: start + i, text: g.join(', ') }));

/** Lo que viaja a la API: términos sueltos, sin vacíos. El servidor limpia el resto (repetidos, grupos de uno). */
const toGroups = (rows: Row[]) =>
  rows
    .map((r) =>
      r.text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    )
    .filter((g) => g.length > 0);

const same = (a: Row[], b: Row[]) => JSON.stringify(toGroups(a)) === JSON.stringify(toGroups(b));

/**
 * Configuración › Búsqueda: los sinónimos del buscador de la tienda y lo que
 * buscan los compradores.
 *
 * Lo que se busca sin resultados está al lado de los sinónimos a propósito:
 * es de donde sale la mayoría de los sinónimos que hacen falta ("mancuerna"
 * no encuentra nada porque el producto se cargó como "DUMBBELL").
 */
export function SearchSettingsPage() {
  const fid = useId();
  const { store } = useStore();
  const { can } = usePermissions();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [settings, setSettings] = useState<SearchSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(10_000);
  const listRef = useRef<HTMLUListElement>(null);

  const apply = (data: SearchSettings) => {
    const fresh = toRows(data.synonyms);
    setSettings(data);
    setRows(fresh);
    setSaved(fresh);
    setLoadError(null);
  };

  useServerLoad(
    store?.id ?? null,
    () => api.get<SearchSettings>('/api/v1/search/settings'),
    apply,
    (err) => setLoadError(errMsg(err, 'No se pudieron cargar los sinónimos.')),
  );

  // Lo buscado es informativo: si falla, la pantalla sigue sirviendo para los sinónimos.
  const queries = useQuery({
    queryKey: ['search-queries', store?.id],
    queryFn: () => api.get<Queries>('/api/v1/search/queries?days=60&limit=20'),
    enabled: !!store?.id && (can('catalog.write') || can('stats.read')),
  });

  const dirty = !same(rows, saved);

  const addRow = (text = '') => {
    setRows((r) => [...r, { key: nextKey.current++, text }]);
    // Al renglón nuevo, para escribir al lado cómo se cargó el producto.
    requestAnimationFrame(() => {
      const inputs = listRef.current?.querySelectorAll('input');
      inputs?.[inputs.length - 1]?.focus();
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      apply(await api.put<SearchSettings>('/api/v1/search/settings', { synonyms: toGroups(rows) }));
      toast('Sinónimos guardados', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar los sinónimos.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Volver a la lista sugerida',
      message: 'Se reemplazan tus sinónimos por la lista que trae la tienda. Lo que agregaste se pierde.',
      confirmLabel: 'Volver a la sugerida',
    });
    if (!ok) return;
    try {
      apply(await api.delete<SearchSettings>('/api/v1/search/settings'));
      toast('Volviste a la lista sugerida', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo restaurar la lista.'), { variant: 'error' });
    }
  };

  const withoutResults = queries.data?.withoutResults ?? [];
  const top = queries.data?.top ?? [];

  return (
    <div className="pb-24">
      <SettingsHeader
        title="Búsqueda"
        description="Cómo encuentra tu tienda lo que escriben tus clientes. Si buscan con palabras distintas a las que usaste al cargar los productos, enseñáselas acá."
      />

      <div className={SETTINGS_COLUMNS}>
        <section className={SETTINGS_CARD} aria-labelledby={`${fid}-syn`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${fid}-syn`} className="text-base font-semibold text-fg">
              Sinónimos
            </h2>
            {settings?.isDefault && <Badge variant="info">Usando la lista sugerida</Badge>}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Un grupo por renglón, con las palabras separadas por coma. Cualquiera de ellas encuentra lo que
            dicen las demás: con “mancuerna, dumbbell”, quien busca mancuernas ve también las DUMBBELL.
          </p>

          {loadError && <p className="mt-4 text-sm text-danger">{loadError}</p>}

          {settings && (
            <>
              <ul ref={listRef} className="mt-4 space-y-2">
                {rows.map((row, i) => (
                  <li key={row.key} className="flex items-center gap-2">
                    <Input
                      aria-label={`Grupo de sinónimos ${i + 1}`}
                      value={row.text}
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((r) => (r.key === row.key ? { ...r, text: e.target.value } : r)),
                        )
                      }
                      placeholder="mancuerna, dumbbell"
                    />
                    <button
                      type="button"
                      onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                      aria-label={`Quitar el grupo ${row.text || i + 1}`}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {rows.length === 0 && (
                <p className="mt-4 rounded-lg border border-dashed border-border py-6 text-center text-sm text-fg-muted">
                  Sin sinónimos: la tienda busca exactamente lo que escriben.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => addRow()}>
                  <Plus className="h-4 w-4" /> Agregar grupo
                </Button>
                {!settings.isDefault && (
                  <Button variant="ghost" onClick={reset}>
                    <RotateCcw className="h-4 w-4" /> Volver a la lista sugerida
                  </Button>
                )}
              </div>
            </>
          )}
        </section>

        <section className={SETTINGS_CARD} aria-labelledby={`${fid}-q`}>
          <h2 id={`${fid}-q`} className="text-base font-semibold text-fg">
            Lo que buscan tus clientes
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Últimos 60 días, en la página de resultados.</p>

          {queries.isLoading && <Loader2 className="mt-4 h-5 w-5 animate-spin text-fg-muted" />}
          {queries.isError && (
            <p className="mt-4 text-sm text-fg-muted">No se pudo cargar lo que se buscó.</p>
          )}

          {queries.data && (
            <div className="mt-4 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-fg">Sin resultados</h3>
                {withoutResults.length === 0 ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    Nada todavía: todo lo que se buscó encontró algo.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {withoutResults.map((q) => (
                      <li key={q.term} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate text-fg">
                          «{q.term}»{' '}
                          <span className="text-fg-muted">
                            · {formatNumber(q.count)} {q.count === 1 ? 'vez' : 'veces'}
                          </span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => addRow(`${q.term}, `)}>
                          Agregar como sinónimo
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-fg">Lo más buscado</h3>
                {top.length === 0 ? (
                  <p className="mt-1 text-sm text-fg-muted">Todavía nadie buscó nada en la tienda.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {top.map((q) => (
                      <li key={q.term} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate text-fg">«{q.term}»</span>
                        <span className="shrink-0 text-xs text-fg-muted">
                          {formatNumber(q.count)} {q.count === 1 ? 'búsqueda' : 'búsquedas'} ·{' '}
                          {q.results === 0
                            ? 'sin resultados'
                            : `${formatNumber(q.results)} ${q.results === 1 ? 'resultado' : 'resultados'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <HelpLink id="busqueda" />

      <SaveBar dirty={dirty && !busy} onSave={save} onCancel={() => setRows(saved)} />
    </div>
  );
}
