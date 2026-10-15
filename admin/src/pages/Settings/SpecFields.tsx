import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Select,
  Switch,
  useConfirm,
  useToast,
  Spinner,
} from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { SETTINGS_CARD } from '../../lib/styles';
import { useServerLoad } from '../../lib/useServerLoad';
import { useModalFormGuard } from '../../lib/useUnsavedChanges';

type SpecType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'LIST';

export interface SpecDefinition {
  id: string;
  name: string;
  key: string;
  type: SpecType;
  unit: string | null;
  options: string[];
  categoryIds: string[];
  showOnProduct: boolean;
  filterable: boolean;
  meliAttributeId: string | null;
  sortOrder: number;
}

interface Category {
  id: string;
  name: string;
  depth: number;
}

const TYPE_LABEL: Record<SpecType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  BOOLEAN: 'Sí / No',
  LIST: 'Lista de opciones',
};

const TYPE_HELP: Record<SpecType, string> = {
  TEXT: 'Cualquier texto: un código OEM, un modelo compatible.',
  NUMBER: 'Un número con su unidad: 20 kg, 50 mm.',
  BOOLEAN: 'Algo que se tiene o no se tiene: «con rodamiento».',
  LIST: 'Una de varias opciones fijas. Es el único tipo que rinde de verdad como filtro: escrito a mano, «Caucho» y «caucho » son dos valores distintos.',
};

/**
 * Los campos de ficha técnica de esta tienda.
 *
 * Son por tienda porque cada una vende otra cosa: en un gimnasio «paso de
 * cadena» no significa nada. Y dentro de la tienda se acotan por categoría,
 * para que quien carga un disco vea tres campos y no cuarenta.
 */
export function SpecFieldsPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SpecDefinition | 'new' | null>(null);

  const [items, setItems] = useState<SpecDefinition[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { reload: load } = useServerLoad(
    store?.id ?? null,
    () => api.get<{ items: SpecDefinition[] }>('/api/v1/spec-definitions/'),
    (d) => {
      setItems(d.items ?? []);
      setLoadError(null);
    },
    (err) => {
      setItems(null);
      setLoadError(errMsg(err, 'No se pudieron cargar los campos.'));
    },
  );

  const categoriesQ = useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<{ items: Category[] }>('/api/v1/categories'),
    enabled: !!store,
  });
  const categories = useMemo(() => categoriesQ.data?.items ?? [], [categoriesQ.data]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const remove = async (field: SpecDefinition) => {
    const ok = await confirm({
      title: `Eliminar «${field.name}»`,
      message:
        'Se borra el campo y también los valores que ya tengan cargados los productos. No se puede deshacer.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/v1/spec-definitions/${field.id}`);
      toast('Campo eliminado', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo eliminar.'), { variant: 'error' });
    }
  };

  return (
    <div className="pb-10">
      <SettingsHeader
        title="Ficha técnica"
        description="Los datos propios de lo que vendés: medidas, materiales, compatibilidad, códigos. Se muestran en la página del producto, se pueden usar como filtro del catálogo y viajan a Mercado Libre."
        action={
          items && items.length > 0 ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Agregar campo
            </Button>
          ) : undefined
        }
      />

      {loadError && (
        <div className={SETTINGS_CARD}>
          <p className="text-sm text-danger">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-card">
          <h3 className="text-base font-semibold text-fg">Todavía no definiste ningún campo</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
            Pensá qué pregunta tu cliente antes de comprar. En equipamiento suele ser el peso, la medida y el
            material; en repuestos, para qué modelo sirve y el código de la pieza.
          </p>
          <Button className="mt-4" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Agregar el primero
          </Button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-2">
          {items.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-card"
            >
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">{f.name}</span>
                  <Badge variant="neutral">{TYPE_LABEL[f.type]}</Badge>
                  {f.unit && <span className="text-xs text-fg-muted">en {f.unit}</span>}
                  {f.filterable && <Badge variant="success">Filtra el catálogo</Badge>}
                  {!f.showOnProduct && <Badge variant="neutral">Oculto en la tienda</Badge>}
                  {f.meliAttributeId && (
                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning">
                      ML: {f.meliAttributeId}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {f.categoryIds.length === 0
                    ? 'Aplica a todo el catálogo.'
                    : `Solo en ${f.categoryIds.map((id) => categoryName.get(id) ?? '—').join(', ')}.`}
                </p>
                {f.type === 'LIST' && f.options.length > 0 && (
                  <p className="mt-1 text-xs text-fg-subtle">{f.options.join(' · ')}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditing(f)}
                  aria-label={`Editar ${f.name}`}
                  className="rounded-md p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(f)}
                  aria-label={`Eliminar ${f.name}`}
                  className="rounded-md p-1.5 text-fg-muted hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <FieldModal
          field={editing === 'new' ? null : editing}
          categories={categories}
          nextOrder={items?.length ?? 0}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <HelpLink id="fichaTecnica" />
    </div>
  );
}

function FieldModal({
  field,
  categories,
  nextOrder,
  onClose,
  onSaved,
}: {
  field: SpecDefinition | null;
  categories: Category[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<SpecType>(field?.type ?? 'TEXT');
  const [unit, setUnit] = useState(field?.unit ?? '');
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join('\n'));
  const [categoryIds, setCategoryIds] = useState<string[]>(field?.categoryIds ?? []);
  const [showOnProduct, setShowOnProduct] = useState(field?.showOnProduct ?? true);
  const [filterable, setFilterable] = useState(field?.filterable ?? false);
  const [meli, setMeli] = useState(field?.meliAttributeId ?? '');
  const [busy, setBusy] = useState(false);
  const { dirty, close } = useModalFormGuard(
    { name, type, unit, optionsText, categoryIds: [...categoryIds].sort(), showOnProduct, filterable, meli },
    onClose,
  );

  const options = optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        type,
        unit: type === 'NUMBER' ? unit.trim() || null : null,
        options: type === 'LIST' ? options : [],
        categoryIds,
        showOnProduct,
        filterable,
        meliAttributeId: meli.trim() || null,
        sortOrder: field?.sortOrder ?? nextOrder,
      };
      if (field) await api.put(`/api/v1/spec-definitions/${field.id}`, body);
      else await api.post('/api/v1/spec-definitions/', body);
      toast(field ? 'Campo guardado' : 'Campo creado', { variant: 'success' });
      onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar el campo.'), { variant: 'error' });
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dirty={dirty}
      title={field ? 'Editar campo' : 'Nuevo campo de ficha técnica'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy || name.trim().length < 2}>
            {busy && <Spinner inline />} Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombre del campo" hint="Como lo va a leer tu cliente en la ficha.">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diámetro del orificio"
            />
          </FormField>
          <FormField label="Tipo" hint={TYPE_HELP[type]}>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as SpecType)}
              options={(Object.keys(TYPE_LABEL) as SpecType[]).map((t) => ({
                value: t,
                label: TYPE_LABEL[t],
              }))}
            />
          </FormField>
        </div>

        {type === 'NUMBER' && (
          <div className="sm:w-40">
            <FormField label="Unidad" hint="Se muestra al lado del número.">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" maxLength={12} />
            </FormField>
          </div>
        )}

        {type === 'LIST' && (
          <FormField label="Opciones" hint="Una por línea. Son las únicas que se van a poder elegir.">
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={5}
              placeholder={'Caucho\nUretano\nHierro fundido'}
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </FormField>
        )}

        <div>
          <div className="mb-1.5 text-sm font-medium text-fg">Dónde aplica</div>
          <p className="mb-2 text-xs text-fg-muted">
            Sin ninguna categoría marcada, el campo aparece en todos los productos. Marcá las categorías donde
            este dato tenga sentido: es lo que evita que quien carga un producto vea campos que no le sirven.
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {categories.length === 0 && (
              <p className="px-1 py-2 text-sm text-fg-muted">Todavía no hay categorías.</p>
            )}
            {categories.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-bg-subtle"
                style={{ paddingLeft: `${0.25 + (c.depth - 1) * 1}rem` }}
              >
                <Checkbox
                  checked={categoryIds.includes(c.id)}
                  onChange={(e) =>
                    setCategoryIds((prev) =>
                      e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                    )
                  }
                />
                <span className="text-sm text-fg">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border bg-bg-subtle p-3">
          <Switch
            checked={showOnProduct}
            onChange={setShowOnProduct}
            label="Mostrarlo en la página del producto"
            description="Aparece en la ficha, debajo de la descripción."
          />
          <Switch
            checked={filterable}
            onChange={setFilterable}
            label="Dejar filtrar el catálogo por este campo"
            description="Aparece como filtro en el listado. Solo se ofrecen los valores que existen: un filtro sin resultados es peor que no tenerlo."
          />
          <FormField
            label="Atributo equivalente en Mercado Libre (opcional)"
            hint="Si lo completás, el valor viaja en la publicación. Una ficha completa posiciona mejor. Ej.: BRAND, MODEL, LENGTH."
          >
            <Input
              value={meli}
              onChange={(e) => setMeli(e.target.value.toUpperCase())}
              placeholder="MODEL"
              className="font-mono"
              maxLength={40}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
