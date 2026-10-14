import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn, useConfirm } from '@tiendafy/ui';
import {
  FOOTER_COLUMN_LINKS_MAX,
  FOOTER_COLUMNS_MAX,
  FOOTER_SINGLE_KINDS,
  FOOTER_TEXT_MAX,
  FOOTER_TITLE_MAX,
  footerColumnTitle,
  footerFlagsFromColumns,
  type FooterColumn,
  type FooterColumnKind,
  type FooterLink,
  type ThemeConfig,
} from '@tiendafy/types';
import { ActionMenu, type ActionMenuEntry } from '../components/ActionMenu';
import { LinkPicker } from '../components/LinkPicker';
import { moveItem } from '../lib/arrays';
import { Check, Field, TextArea, TextInput } from './theme-editor-inputs';
import { ItemListEditor, RenameInput } from './theme-editor/sections/ItemListEditor';

/* ============================================================
   Columnas del pie, armables (como los pies de Shopify o Tiendanube).

   El comercio decide qué columnas hay, con qué título y en qué orden. Las
   filas son como las del menú del encabezado: el nombre (hasta dos
   renglones) con su tipo abajo, la flecha para abrirla y un ⋯ con mover,
   cambiar nombre y eliminar.

   Lo que ya existía (redes, contactos, texto del pie, título de novedades)
   sigue en su lugar del panel: la columna dice DÓNDE se ve, no lo copia.
   Por eso el título de la columna de novedades es el mismo `newsletterTitle`
   de siempre, y no uno aparte que se pise con él.
   ============================================================ */

type Footer = ThemeConfig['footer'];

export const COLUMN_KINDS: { kind: FooterColumnKind; label: string; description: string }[] = [
  {
    kind: 'social',
    label: 'Marca y redes',
    description: 'Tu logo, el texto del pie y los íconos de tus redes.',
  },
  {
    kind: 'links',
    label: 'Links',
    description: 'Una lista con su título: categorías, productos, páginas o sitios de afuera.',
  },
  {
    kind: 'pages',
    label: 'Páginas de contenido',
    description: 'Tus páginas publicadas (Cómo comprar, Preguntas…), solas.',
  },
  { kind: 'contact', label: 'Contacto', description: 'WhatsApp, teléfonos, emails y direcciones.' },
  {
    kind: 'newsletter',
    label: 'Suscripción a novedades',
    description: 'Un campo para dejar el email y recibir ofertas.',
  },
  {
    kind: 'text',
    label: 'Texto',
    description: 'Un párrafo libre: quiénes son, horarios, desde dónde envían.',
  },
];
const KIND_LABEL = Object.fromEntries(COLUMN_KINDS.map((k) => [k.kind, k.label])) as Record<
  FooterColumnKind,
  string
>;

/** Botón cuadrado de 40 px (se toca con el dedo en el panel angosto). */
const ICON_BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg';

/** Un id nuevo para una columna (solo en handlers: no es puro). */
const newColumnId = (kind: FooterColumnKind) =>
  `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Una columna recién agregada, con lo que cada tipo necesita para arrancar. */
function newColumn(kind: FooterColumnKind): FooterColumn {
  const id = newColumnId(kind);
  if (kind === 'links') return { id, kind, title: '', links: [{ label: '', href: '' }] };
  if (kind === 'text') return { id, kind, title: '', text: '' };
  return { id, kind };
}

/** Las columnas y los booleanos que dependen de ellas, juntos: así nunca se desincronizan. */
export const columnsPatch = (columns: FooterColumn[]): Partial<Footer> => ({
  columns,
  ...footerFlagsFromColumns(columns),
});

/**
 * Prende o apaga un tipo (lo usan los estilos rápidos, que hablan de "con
 * páginas" o "con novedades"). Prender respeta el tope; apagar las páginas
 * también las saca de las columnas de links que las sumaban.
 */
export function toggleColumnKind(
  columns: FooterColumn[],
  kind: 'pages' | 'newsletter',
  on: boolean,
): FooterColumn[] {
  const flags = footerFlagsFromColumns(columns);
  const present = kind === 'pages' ? flags.showPages : flags.showNewsletter;
  if (on) {
    if (present || columns.length >= FOOTER_COLUMNS_MAX) return columns;
    const column: FooterColumn = { id: kind, kind };
    if (kind === 'newsletter') return [...columns, column];
    // Las páginas, después de la marca y los links (donde estaban en el pie de siempre).
    const at = columns.reduce((last, c, i) => (c.kind === 'social' || c.kind === 'links' ? i + 1 : last), 0);
    return [...columns.slice(0, at), column, ...columns.slice(at)];
  }
  return columns
    .filter((c) => c.kind !== kind)
    .map((c) => {
      if (kind !== 'pages' || !c.withPages) return c;
      const { withPages: _, ...rest } = c;
      return rest;
    });
}

export function FooterColumnsEditor({
  footer,
  set,
  onFocusPreview,
}: {
  footer: Footer;
  set: (patch: Partial<Footer>) => void;
  /** Resaltar la columna en la vista previa (scroll + destello). */
  onFocusPreview?: (target: string) => void;
}) {
  const confirm = useConfirm();
  const columns = footer.columns ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const full = columns.length >= FOOTER_COLUMNS_MAX;

  const save = (next: FooterColumn[]) => set(columnsPatch(next));
  const patch = (id: string, change: Partial<FooterColumn>) =>
    save(columns.map((c) => (c.id === id ? { ...c, ...change } : c)));

  const nameOf = (c: FooterColumn) => footerColumnTitle(c, footer) || KIND_LABEL[c.kind];
  const subtitleOf = (c: FooterColumn) => {
    if (c.kind !== 'links') return KIND_LABEL[c.kind];
    const n = c.links?.length ?? 0;
    return `${KIND_LABEL.links} · ${n === 1 ? '1 link' : `${n} links`}${c.withPages ? ' + páginas' : ''}`;
  };

  const open = (id: string | null) => {
    setExpanded(id);
    if (id) onFocusPreview?.(`footer-col:${id}`);
  };

  /** El nombre de la columna. El de novedades es el título de siempre (`newsletterTitle`). */
  const rename = (c: FooterColumn, value: string) => {
    const clean = value.slice(0, FOOTER_TITLE_MAX);
    if (c.kind === 'newsletter') set({ newsletterTitle: clean.trim() });
    else patch(c.id, { title: clean.trim() || undefined });
  };

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= columns.length) return;
    save(moveItem(columns, index, to));
  };

  const remove = async (c: FooterColumn) => {
    const ok = await confirm({
      title: 'Eliminar columna',
      message: `¿Eliminar la columna «${nameOf(c)}»? Lo podés recuperar con Ctrl+Z.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    if (expanded === c.id) setExpanded(null);
    save(columns.filter((x) => x.id !== c.id));
  };

  const add = (kind: FooterColumnKind) => {
    setAdding(false);
    if (full) return;
    const column = newColumn(kind);
    save([...columns, column]);
    open(column.id);
  };

  const actionsOf = (c: FooterColumn, index: number): ActionMenuEntry[] => [
    { label: 'Mover arriba', icon: ArrowUp, onSelect: () => move(index, -1), disabled: index === 0 },
    {
      label: 'Mover abajo',
      icon: ArrowDown,
      onSelect: () => move(index, 1),
      disabled: index === columns.length - 1,
    },
    { label: 'Cambiar nombre', icon: Pencil, onSelect: () => setRenaming(c.id) },
    { type: 'separator' },
    { label: 'Eliminar', icon: Trash2, onSelect: () => void remove(c), danger: true },
  ];

  const taken = new Set(columns.map((c) => c.kind));

  return (
    <div>
      <p className="mb-2 text-xs text-fg-muted">
        En la compu van lado a lado, en este orden; en el celular, una debajo de la otra. Tocá una columna
        para cambiarle el título o sus links; con ⋯ la movés, la renombrás o la eliminás.
      </p>
      {columns.length === 0 && (
        <p className="mb-2 rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
          Sin columnas: el pie muestra solo los medios de pago y los links legales.
        </p>
      )}
      <ul className="space-y-1.5" aria-label="Columnas del pie">
        {columns.map((c, index) => {
          const name = nameOf(c);
          const isOpen = expanded === c.id;
          const bodyId = `footer-col-${c.id.replace(/[^\w-]/g, '-')}`;
          return (
            <li key={c.id}>
              <div
                className={cn(
                  'flex min-h-12 items-center gap-0.5 rounded-lg border bg-surface pr-1 transition-colors',
                  isOpen ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-bg-muted/60',
                )}
              >
                {renaming === c.id ? (
                  <RenameInput
                    initial={c.kind === 'newsletter' ? footer.newsletterTitle : (c.title ?? '')}
                    placeholder={footerColumnTitle({ ...c, title: '' }, { newsletterTitle: '' }) || name}
                    label="Nombre de la columna"
                    onDone={(value) => {
                      if (value !== null) rename(c, value);
                      setRenaming(null);
                    }}
                    className="ml-1.5"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => open(isOpen ? null : c.id)}
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-2 break-words text-sm font-medium leading-snug text-fg">
                        {name}
                      </span>
                      <span className="text-xs text-fg-muted">{subtitleOf(c)}</span>
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none',
                        isOpen && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                )}
                <ActionMenu label={`Más acciones de «${name}»`} entries={actionsOf(c, index)} />
              </div>
              {isOpen && (
                <div
                  id={bodyId}
                  className="mt-1 space-y-3 rounded-lg border border-border bg-bg-muted/40 p-3"
                >
                  <ColumnForm column={c} footer={footer} set={set} patch={(ch) => patch(c.id, ch)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        {adding ? (
          <div
            className="rounded-lg border border-border bg-surface p-1.5"
            role="group"
            aria-label="Tipo de columna"
          >
            <div className="flex items-center justify-between pl-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                ¿Qué columna agregás?
              </span>
              <button
                type="button"
                onClick={() => setAdding(false)}
                aria-label="Cancelar"
                className={ICON_BTN}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <ul>
              {COLUMN_KINDS.map((k) => {
                const already = FOOTER_SINGLE_KINDS.includes(k.kind) && taken.has(k.kind);
                return (
                  <li key={k.kind}>
                    <button
                      type="button"
                      onClick={() => add(k.kind)}
                      disabled={already}
                      className="flex min-h-11 w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-bg-muted disabled:pointer-events-none disabled:opacity-50"
                    >
                      <span className="text-sm font-medium text-fg">
                        {k.label}
                        {already && <span className="font-normal text-fg-muted"> · ya está</span>}
                      </span>
                      <span className="text-xs text-fg-muted">{k.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={full}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm font-medium text-primary hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden /> Agregar columna
          </button>
        )}
        {full && (
          <p className="mt-2 text-xs text-fg-subtle">
            Llegaste al máximo de {FOOTER_COLUMNS_MAX} columnas: con más, en la compu quedan tan angostas que
            los links se parten. Eliminá una para agregar otra.
          </p>
        )}
      </div>
    </div>
  );
}

/** Lo que se edita de cada columna al abrirla. */
function ColumnForm({
  column: c,
  footer,
  set,
  patch,
}: {
  column: FooterColumn;
  footer: Footer;
  set: (patch: Partial<Footer>) => void;
  patch: (change: Partial<FooterColumn>) => void;
}) {
  const defaultTitle = footerColumnTitle({ ...c, title: '' }, { newsletterTitle: '' });
  const contacts = [...footer.whatsapps, ...footer.phones, ...footer.emails, ...footer.addresses].filter(
    Boolean,
  );

  return (
    <>
      {c.kind === 'newsletter' ? (
        <Field label="Título">
          <TextInput
            value={footer.newsletterTitle}
            onChange={(v) => set({ newsletterTitle: v })}
            placeholder="Recibí novedades y ofertas"
            maxLength={FOOTER_TITLE_MAX}
          />
        </Field>
      ) : (
        <Field
          label="Título"
          hint={
            defaultTitle
              ? `Vacío = «${defaultTitle}». En el pie centrado solo se ve si le ponés uno.`
              : 'Vacío = sin título.'
          }
        >
          <TextInput
            value={c.title ?? ''}
            onChange={(v) => patch({ title: v || undefined })}
            placeholder={c.kind === 'text' ? 'Quiénes somos' : defaultTitle || 'Título'}
            maxLength={FOOTER_TITLE_MAX}
          />
        </Field>
      )}

      {c.kind === 'links' && (
        <>
          <ItemListEditor<FooterLink>
            items={c.links ?? []}
            onChange={(links) => patch({ links })}
            max={FOOTER_COLUMN_LINKS_MAX}
            addLabel="Agregar link"
            listLabel="Links de la columna"
            itemTitle={(l) => l.label?.trim() ?? ''}
            createItem={() => ({ label: '', href: '' })}
            renderItem={(l, update) => (
              <>
                <Field label="Texto">
                  <TextInput
                    value={l.label ?? ''}
                    onChange={(v) => update({ label: v })}
                    placeholder="Envíos"
                    maxLength={FOOTER_TITLE_MAX}
                  />
                </Field>
                <LinkPicker
                  label="A dónde lleva"
                  value={l.href}
                  onChange={(href, pick) =>
                    // Sin texto todavía: se propone el nombre de lo elegido.
                    update({ href, ...(!l.label?.trim() && pick?.label ? { label: pick.label } : {}) })
                  }
                  newTab={l.newTab}
                  onNewTabChange={(v) => update({ newTab: v || undefined })}
                />
              </>
            )}
          />
          <Check
            label="Sumar tus páginas de contenido al final"
            hint="Cómo comprar, preguntas frecuentes, envíos… Las que publiques aparecen solas."
            checked={!!c.withPages}
            onChange={(v) => patch({ withPages: v || undefined })}
          />
        </>
      )}

      {c.kind === 'pages' && (
        <p className="text-xs text-fg-muted">
          Muestra tus páginas de contenido publicadas, en el orden de Páginas de contenido. Las que publiques
          aparecen solas; sin ninguna publicada, la columna no se ve.
        </p>
      )}

      {c.kind === 'text' && (
        <Field label="Texto" hint="Quiénes son, horarios de atención, desde dónde envían.">
          <TextArea
            value={c.text ?? ''}
            onChange={(v) => patch({ text: v })}
            rows={4}
            maxLength={FOOTER_TEXT_MAX}
          />
        </Field>
      )}

      {c.kind === 'social' && (
        <>
          <Check
            label="Mostrar tu logo y el texto del pie"
            hint="Arriba de las redes. Sin esto, la columna lleva solo los íconos."
            checked={!c.hideBrand}
            onChange={(v) => patch({ hideBrand: v ? undefined : true })}
          />
          <p className="text-xs text-fg-muted">
            Las redes y el texto se cargan más abajo, en «Redes sociales» y «Texto del pie».
            {!footer.showSocial && ' Ahora las redes están apagadas.'}
          </p>
        </>
      )}

      {c.kind === 'contact' && (
        <p
          className={cn(
            'text-xs',
            contacts.length ? 'text-fg-muted' : 'rounded-md bg-warning/10 p-2.5 text-fg',
          )}
        >
          {contacts.length
            ? `Muestra lo que cargaste en «Contacto en el pie» (${contacts.length}).`
            : 'Todavía no cargaste ningún dato en «Contacto en el pie», más abajo: hasta entonces la columna no se ve.'}
        </p>
      )}

      {c.kind === 'newsletter' && (
        <p className="text-xs text-fg-muted">
          Los emails quedan guardados y se pueden usar como audiencia en Email marketing.
        </p>
      )}
    </>
  );
}
