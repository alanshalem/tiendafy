import {
  Check as CheckIcon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code,
  Construction,
  Copy,
  ExternalLink,
  History,
  FileText,
  Home,
  Image,
  List,
  MessageCircle,
  Package,
  Palette,
  Phone,
  Search as SearchIcon,
  Sparkles,
  ShoppingCart,
  ShoppingBag,
  Square,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { type ThemeConfig, baseTheme, heroUnderHeader } from '@tiendafy/types';
import { HelpLink } from '../components/HelpLink';

export function RootNav({
  onNavigate,
  theme,
  onOpenGallery,
  onLeave,
  onSearch,
  onHistory,
  onCopyFromStore,
}: {
  onNavigate: (v: string) => void;
  theme: ThemeConfig;
  onOpenGallery: () => void;
  /** Abre el buscador de opciones (también con Ctrl+K). */
  onSearch: () => void;
  /** Abre el historial de publicaciones. */
  onHistory: () => void;
  /** Copiar el diseño de otra tienda. Sin otras tiendas, no se ofrece. */
  onCopyFromStore?: () => void;
  /** Salir del editor hacia otra pantalla del panel (el borrador se guarda al desmontar). */
  onLeave: (path: string) => void;
}) {
  return (
    <div className="py-2">
      <EditorChecklist theme={theme} onNavigate={onNavigate} />

      {/* Buscar una opción por nombre: más rápido que recordar en qué panel vive. */}
      <button
        onClick={onSearch}
        className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-border bg-bg-muted px-3 py-2 text-left text-sm text-fg-muted hover:text-fg"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1">Buscar una opción…</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold md:inline">
          Ctrl K
        </kbd>
      </button>

      {onCopyFromStore && (
        <NavRow icon={Copy} label="Copiar el diseño de otra tienda" onClick={onCopyFromStore} />
      )}

      {/* Atajo a diseños completos listos (colores + fuentes + secciones en 1 click). */}
      <button
        onClick={onOpenGallery}
        className="mx-3 mb-1 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-primary/10"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">Elegí un diseño listo</span>
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Orden de armado: de lo global (marca) a lo específico (conversión) → la tienda "se arma sola". */}
      <GroupLabel>1 · Identidad</GroupLabel>
      <NavRow icon={Image} label="Logo de la tienda" onClick={() => onNavigate('logo')} />
      <NavRow icon={Palette} label="Colores de tu marca" onClick={() => onNavigate('colors')} />
      <NavRow icon={Type} label="Tipo de letra" onClick={() => onNavigate('fonts')} />

      <GroupLabel>2 · Estilo global</GroupLabel>
      <NavRow icon={Square} label="Estilo y movimiento" onClick={() => onNavigate('radius')} />

      <GroupLabel>3 · Estructura de la tienda</GroupLabel>
      <NavRow icon={ChevronUp} label="Encabezado" onClick={() => onNavigate('header')} />
      <NavRow icon={ChevronDown} label="Pie de página" onClick={() => onNavigate('footer')} />

      <GroupLabel>4 · Contenido</GroupLabel>
      <NavRow icon={Home} label="Página de inicio" onClick={() => onNavigate('home')} />
      <NavRow icon={List} label="Listado de productos" onClick={() => onNavigate('products-list')} />
      <NavRow icon={Package} label="Detalle de producto" onClick={() => onNavigate('product-detail')} />

      <GroupLabel>5 · Conversión y contacto</GroupLabel>
      <NavRow icon={ShoppingCart} label="Carrito de compras" onClick={() => onNavigate('cart')} />
      <NavRow icon={MessageCircle} label="Botón de WhatsApp" onClick={() => onNavigate('whatsapp')} />
      <NavRow icon={Phone} label="Contacto" onClick={() => onNavigate('contact')} />

      <GroupLabel>6 · Avanzado y estado</GroupLabel>
      <NavRow icon={History} label="Historial de publicaciones" onClick={onHistory} />
      <NavRow icon={Code} label="Edición avanzada de CSS" onClick={() => onNavigate('css')} />
      <NavRow icon={Construction} label="Tienda en construcción" onClick={() => onNavigate('coming-soon')} />

      {/* Partes de la tienda que el comprador ve pero que no se pintan acá: sin
          estas dos filas el diseño terminaba en un callejón y había que salir a
          buscarlas por el menú del panel. */}
      <GroupLabel>7 · Se edita en otra pantalla</GroupLabel>
      <NavRow
        icon={ShoppingBag}
        label="Opciones del checkout"
        external
        onClick={() => onLeave('/configuracion/opciones-del-checkout')}
      />
      <NavRow icon={FileText} label="Páginas de contenido" external onClick={() => onLeave('/paginas')} />

      <div className="px-4 pb-4 pt-2">
        <HelpLink id="tema" />
      </div>
    </div>
  );
}

/**
 * Checklist de progreso: nudges accionables (cada uno abre su panel). Usa solo
 * señales del theme (sin fetches extra). Se colapsa a un resumen cuando está todo.
 */
export function checklistItems(theme: ThemeConfig) {
  const f = theme.footer;
  return [
    { label: 'Cargá tu logo', done: !!theme.logo, view: 'logo' },
    {
      label: 'Elegí colores de marca',
      done: theme.colors.primary !== baseTheme.colors.primary,
      view: 'colors',
    },
    // Antes: "Armá tu página de inicio" (hay secciones) y "Mostrá medios de
    // pago" (hay logos). Las dos venían hechas de fábrica: el progreso
    // arrancaba en 2/5 sin haber tocado nada.
    { label: 'Poné una foto de portada', done: heroUnderHeader(theme.sections), view: 'home' },
    {
      label: 'Sumá tus redes sociales',
      done: f.showSocial && [f.instagram, f.facebook, f.tiktok, f.youtube, f.x].some((u) => !!u?.trim()),
      view: 'footer',
    },
    {
      label: 'Activá el botón de WhatsApp',
      done: theme.whatsappButton.enabled && !!theme.whatsappButton.phone.replace(/\D/g, ''),
      view: 'whatsapp',
    },
    {
      label: 'Cargá datos de contacto',
      done: !!(theme.contact.whatsapp || theme.contact.phone || theme.contact.email || theme.contact.address),
      view: 'contact',
    },
  ];
}

function EditorChecklist({ theme, onNavigate }: { theme: ThemeConfig; onNavigate: (v: string) => void }) {
  const items = checklistItems(theme);
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  if (doneCount === items.length) return null; // todo listo → no molestar

  return (
    <div className="mx-3 mb-3 mt-1 rounded-lg border border-border bg-bg-muted p-3">
      <div className="mb-1.5 flex items-center justify-between text-sm font-semibold text-fg">
        <span>Poné tu tienda linda</span>
        <span className="text-xs text-fg-muted">
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.view}>
            <button
              onClick={() => onNavigate(it.view)}
              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-surface"
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  it.done ? 'border-primary bg-primary text-primary-fg' : 'border-border text-transparent',
                )}
              >
                <CheckIcon className="h-3 w-3" />
              </span>
              <span className={cn('flex-1', it.done ? 'text-fg-muted line-through' : 'text-fg')}>
                {it.label}
              </span>
              {!it.done && <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
      {children}
    </div>
  );
}
function NavRow({
  icon: Icon,
  label,
  onClick,
  external,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Marca las filas que sacan del editor, para que nadie se sorprenda al salir. */
  external?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg hover:bg-bg-muted"
    >
      <Icon className="h-4 w-4 shrink-0 text-fg-muted" />
      <span className="flex-1">{label}</span>
      {external ? (
        <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />
      ) : (
        <ChevronRight className="h-4 w-4 text-fg-subtle" />
      )}
    </button>
  );
}
