import { useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut, Search, Store } from 'lucide-react';
import { Dropdown } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { storePublicUrl } from '../lib/storefront';
import { ThemeModeToggle } from './ThemeModeToggle';
import { openCommandPalette, paletteShortcut } from './CommandPalette';

/**
 * La derecha del encabezado, igual en el panel y en Configuración: buscar,
 * ver la tienda, modo claro/oscuro y la cuenta.
 *
 * - El buscador (Ctrl+K) existía pero nada en pantalla lo mostraba: ahora es
 *   un botón con el atajo al lado.
 * - "Ver mi tienda" y "Cerrar sesión" eran íconos de 16 px en el teléfono, y
 *   cerrar sesión estaba pegado al botón de modo oscuro: un dedo apenas
 *   corrido te sacaba del panel. Todo mide al menos 40 px, y cerrar sesión
 *   vive adentro del menú de la cuenta.
 * - Configuración no tenía nada de esto: para ver la tienda o salir había que
 *   volver al panel.
 */
export function HeaderActions() {
  const { store } = useStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.name ?? user?.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Buscar en el panel"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg md:w-56 md:justify-start lg:w-64"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left md:inline">Buscar…</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-3xs text-fg-subtle md:inline">
          {paletteShortcut()}
        </kbd>
      </button>

      {store && (
        <a
          href={storePublicUrl(store)}
          target="_blank"
          rel="noreferrer"
          aria-label="Ver mi tienda"
          className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-bg-muted"
        >
          <span className="hidden lg:inline">Ver mi tienda</span>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}

      <ThemeModeToggle className="h-10 w-10" />

      <Dropdown>
        <Dropdown.Trigger
          bare
          label={`Tu cuenta${user?.name ? `: ${user.name}` : ''}`}
          className="h-10 min-w-10 justify-center gap-2 rounded-full hover:text-fg sm:ml-1 sm:border-l sm:border-border sm:pl-3"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
          >
            {initial}
          </span>
          <span className="hidden max-w-[8rem] truncate text-sm text-fg-muted sm:inline">{user?.name}</span>
        </Dropdown.Trigger>
        <Dropdown.Menu align="end">
          {user?.email && (
            <div className="border-b border-border px-3 py-2 text-xs text-fg-subtle" role="presentation">
              {user.email}
            </div>
          )}
          <Dropdown.Item onSelect={() => navigate('/tenants')}>
            <span className="flex items-center gap-2">
              <Store className="h-4 w-4" aria-hidden="true" /> Mis tiendas
            </span>
          </Dropdown.Item>
          <Dropdown.Item destructive onSelect={() => logout()}>
            <span className="flex items-center gap-2">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
            </span>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}
