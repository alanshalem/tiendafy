import {
  AlertTriangle,
  ExternalLink,
  Monitor,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button, Dropdown, Tooltip, cn } from '@tiendafy/ui';
import type { Tenant } from '@tiendafy/types';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { toggleMode, type ThemeMode } from '../../lib/themeMode';
import type { SaveState } from './useThemeDraft';

export type Device = 'mobile' | 'tablet' | 'desktop';

const DEVICES = [
  { id: 'mobile' as const, label: 'Celulares', icon: Smartphone },
  { id: 'tablet' as const, label: 'Tablets', icon: Tablet },
  { id: 'desktop' as const, label: 'Computadoras', icon: Monitor },
];

/**
 * La barra de arriba del editor. En pantallas chicas queda lo indispensable
 * (cerrar, estado del guardado y Publicar) y el resto pasa al menú ⋯. Antes
 * era una sola fila con todo y en un celular Publicar quedaba fuera de la
 * pantalla.
 */
export function EditorTopBar({
  storeName,
  storeId,
  stores,
  saveState,
  saveError,
  conflict,
  dirty,
  publishing,
  scheduled,
  device,
  previewBase,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  panelCollapsed,
  onTogglePanel,
  onClose,
  onRetrySave,
  onSelectStore,
  onDevice,
  onSchedule,
  onShowChanges,
  onDiscard,
  onPublish,
}: {
  storeName: string;
  storeId: string;
  stores: Tenant[];
  saveState: SaveState;
  saveError: string | null;
  conflict: boolean;
  dirty: boolean;
  publishing: boolean;
  scheduled: boolean;
  device: Device;
  previewBase: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Panel de opciones escondido (md+): la vista previa usa todo el ancho. */
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  onClose: () => void;
  onRetrySave: () => void;
  onSelectStore: (store: Tenant) => void;
  onDevice: (device: Device) => void;
  onSchedule: () => void;
  onShowChanges: () => void;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          <X className="h-5 w-5" />
        </button>
        {/* En un celular el título no entra junto a deshacer/rehacer y Publicar: el X ya dice dónde estás. */}
        <span className="hidden truncate font-semibold text-fg sm:inline">Editar diseño</span>
        <span className="hidden shrink-0 rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success sm:inline">
          ● Borrador
        </span>
        {/* Estado del autosave: sin esto, un guardado fallido era invisible y se perdía trabajo. */}
        {saveState === 'saving' && <span className="shrink-0 text-xs text-fg-subtle">Guardando…</span>}
        {saveState === 'saved' && <span className="shrink-0 text-xs text-fg-subtle">Guardado</span>}
        {saveState === 'error' && !conflict && (
          <button
            onClick={onRetrySave}
            title={saveError ?? undefined}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-danger hover:underline"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> No se guardó — Reintentar
          </button>
        )}
        {stores.length > 1 && (
          <Dropdown className="hidden xl:block">
            <Dropdown.Trigger>{storeName}</Dropdown.Trigger>
            <Dropdown.Menu align="start">
              {stores.map((s) => (
                <Dropdown.Item key={s.id} onSelect={() => s.id !== storeId && onSelectStore(s)}>
                  <span className={cn('block', s.id === storeId && 'font-semibold text-primary')}>
                    {s.name}
                  </span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>
      {/* El ancho de la vista previa: en un celular no se muestra (la vista
          previa ya es la del celular); en pantallas medianas, solo íconos. El
          panel se puede esconder para mirar la vista previa más grande. */}
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <IconButton
          icon={panelCollapsed ? PanelLeftOpen : PanelLeftClose}
          label={panelCollapsed ? 'Mostrar el panel de opciones' : 'Esconder el panel de opciones'}
          pressed={panelCollapsed}
          onClick={onTogglePanel}
        />
        <div className="flex shrink-0 gap-1 rounded-full border border-border bg-bg-muted p-1">
          {DEVICES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onDevice(id)}
              aria-label={label}
              title={label}
              aria-pressed={device === id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                device === id ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" /> <span className="hidden min-[1440px]:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {/* Deshacer y rehacer a la vista: el Ctrl+Z existía pero nadie lo sabía, y en el celular no hay teclado. */}
        <div className="flex items-center">
          <IconButton
            icon={Undo2}
            label="Deshacer"
            shortcut={`${MOD}+Z`}
            keys="Control+Z Meta+Z"
            disabled={!canUndo}
            onClick={onUndo}
          />
          <IconButton
            icon={Redo2}
            label="Rehacer"
            shortcut={`${MOD}+Shift+Z`}
            keys="Control+Shift+Z Meta+Shift+Z Control+Y"
            disabled={!canRedo}
            onClick={onRedo}
          />
        </div>
        <div className="hidden items-center gap-3 xl:flex">
          <ThemeModeToggle />
          <a
            href={previewBase}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver tienda <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={onSchedule}
            title="Programar la publicación para más adelante"
            className={cn('text-sm font-medium hover:text-fg', scheduled ? 'text-primary' : 'text-fg-muted')}
          >
            {scheduled ? 'Programado' : 'Programar'}
          </button>
          {dirty && (
            <button onClick={onShowChanges} className="text-sm font-medium text-fg-muted hover:text-fg">
              Ver qué cambió
            </button>
          )}
          <button
            onClick={onDiscard}
            disabled={!dirty}
            className="text-sm font-medium text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Descartar
          </button>
        </div>
        <EditorMenu
          previewBase={previewBase}
          scheduled={scheduled}
          dirty={dirty}
          stores={stores}
          storeId={storeId}
          onSchedule={onSchedule}
          onShowChanges={onShowChanges}
          onDiscard={onDiscard}
          onSelectStore={onSelectStore}
        />
        <Button
          loading={publishing}
          disabled={!dirty}
          onClick={onPublish}
          aria-label={dirty ? 'Publicar cambios' : 'Sin cambios'}
        >
          <span className="sm:hidden">{dirty ? 'Publicar' : 'Publicado'}</span>
          <span className="hidden sm:inline">{dirty ? 'Publicar cambios' : 'Sin cambios'}</span>
        </Button>
      </div>
    </header>
  );
}

/** En Mac el atajo se escribe con ⌘; en el resto, Ctrl. */
const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘'
    : 'Ctrl';

/** Botón de solo ícono de 40 px con su nombre en un globito (y el atajo, si tiene). */
function IconButton({
  icon: Icon,
  label,
  shortcut,
  keys,
  pressed,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  /** aria-keyshortcuts: el atajo para lectores de pantalla. */
  keys?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={shortcut ? `${label} (${shortcut})` : label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-keyshortcuts={keys}
        aria-pressed={pressed}
        className="flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg disabled:pointer-events-none disabled:opacity-35"
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
      </button>
    </Tooltip>
  );
}

/**
 * Lo que no entra en el encabezado de una pantalla chica: ver la tienda,
 * programar, ver qué cambió, descartar, el modo oscuro y la tienda. En
 * pantallas grandes (xl; en 1024 px no entraban junto a deshacer y el ancho de
 * la vista previa) estos mismos controles están a la vista y el menú no
 * aparece.
 */
function EditorMenu({
  previewBase,
  scheduled,
  dirty,
  stores,
  storeId,
  onSchedule,
  onShowChanges,
  onDiscard,
  onSelectStore,
}: {
  previewBase: string;
  scheduled: boolean;
  dirty: boolean;
  stores: Tenant[];
  storeId: string;
  onSchedule: () => void;
  onShowChanges: () => void;
  onDiscard: () => void;
  onSelectStore: (store: Tenant) => void;
}) {
  // El modo se lee al abrir el menú: lo aplica el documento (lib/themeMode).
  const mode = (document.documentElement.dataset.theme as ThemeMode) || 'light';
  return (
    <Dropdown className="xl:hidden">
      <Dropdown.Trigger
        bare
        label="Más opciones"
        className="flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        <MoreHorizontal className="h-5 w-5" />
      </Dropdown.Trigger>
      <Dropdown.Menu align="end">
        <Dropdown.Item onSelect={() => window.open(previewBase, '_blank', 'noreferrer')}>
          <ExternalLink className="mr-2 inline h-4 w-4" /> Ver tienda
        </Dropdown.Item>
        <Dropdown.Item onSelect={onSchedule}>{scheduled ? 'Programado' : 'Programar'}</Dropdown.Item>
        {dirty && <Dropdown.Item onSelect={onShowChanges}>Ver qué cambió</Dropdown.Item>}
        <Dropdown.Item onSelect={onDiscard} disabled={!dirty} destructive>
          Descartar
        </Dropdown.Item>
        <Dropdown.Item onSelect={() => toggleMode(mode)}>
          {mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </Dropdown.Item>
        {stores.length > 1 &&
          stores
            .filter((s) => s.id !== storeId)
            .map((s) => (
              <Dropdown.Item key={s.id} onSelect={() => onSelectStore(s)}>
                Editar {s.name}
              </Dropdown.Item>
            ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
