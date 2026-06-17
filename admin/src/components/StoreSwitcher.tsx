import { Dropdown } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';

/** Selector de tienda activa. Reutilizable en el admin y en Configuración. */
export function StoreSwitcher() {
  const { store, stores, selectStore } = useStore();

  if (stores.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-border bg-bg-subtle px-3 text-sm font-medium text-fg-subtle"
      >
        Sin tiendas
      </button>
    );
  }

  return (
    <Dropdown>
      <Dropdown.Trigger>{store ? store.name : 'Elegir tienda'}</Dropdown.Trigger>
      <Dropdown.Menu>
        {stores.map((s) => (
          <Dropdown.Item key={s.id} onSelect={() => selectStore(s)}>
            {s.name}
            <span className="ml-2 text-xs text-fg-subtle">{s.subdomain}</span>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
