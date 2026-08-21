import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { cn, Modal } from '@tiendafy/ui';
import { api } from '../../lib/api';

interface RoleRow {
  role: string;
  rank: number;
  permissions: string[];
}

/**
 * Qué significa cada permiso, en castellano y desde el punto de vista de quien
 * lo va a leer. Las claves son las del backend; el texto es copy de panel, por
 * eso vive acá y no allá.
 *
 * `sensitive` marca lo que puede costar plata o abrir la puerta a más accesos:
 * son los permisos que conviene mirar dos veces antes de dárselos a alguien.
 */
const PERMISSIONS: { key: string; label: string; area: string; sensitive?: boolean }[] = [
  { key: 'orders.read', label: 'Ver las ventas', area: 'Ventas' },
  { key: 'orders.fulfill', label: 'Despachar pedidos', area: 'Ventas' },
  { key: 'orders.refund', label: 'Devolver plata', area: 'Ventas', sensitive: true },
  { key: 'stats.read', label: 'Ver estadísticas y ganancias', area: 'Ventas' },

  { key: 'catalog.write', label: 'Crear y editar productos', area: 'Catálogo' },
  { key: 'inventory.read', label: 'Ver el stock', area: 'Catálogo' },
  { key: 'inventory.write', label: 'Ajustar el stock', area: 'Catálogo' },
  { key: 'purchasing', label: 'Compras e importaciones', area: 'Catálogo' },

  { key: 'customers.read', label: 'Ver clientes', area: 'Clientes' },
  { key: 'customers.write', label: 'Editar clientes', area: 'Clientes' },
  { key: 'support.chat', label: 'Responder el chat posventa', area: 'Clientes' },
  { key: 'messages.read', label: 'Leer mensajes de contacto', area: 'Clientes' },

  { key: 'discounts.read', label: 'Ver cupones', area: 'Marketing' },
  { key: 'discounts.write', label: 'Crear cupones', area: 'Marketing' },
  { key: 'content.write', label: 'Editar la tienda y sus páginas', area: 'Marketing' },
  { key: 'social', label: 'Publicar en redes sociales', area: 'Marketing' },

  { key: 'fiscal.emit', label: 'Emitir y anular facturas', area: 'Facturación', sensitive: true },
  { key: 'fiscal.config', label: 'Configurar la facturación (ARCA)', area: 'Facturación', sensitive: true },

  { key: 'payments.read', label: 'Ver la configuración de cobros', area: 'Configuración' },
  { key: 'payments.write', label: 'Conectar y desconectar cobros', area: 'Configuración', sensitive: true },
  { key: 'settings.write', label: 'Envíos, emails y checkout', area: 'Configuración' },
  { key: 'members.read', label: 'Ver el equipo', area: 'Configuración' },
  { key: 'members.manage', label: 'Invitar y sacar gente', area: 'Configuración', sensitive: true },
  { key: 'tenant.admin', label: 'Dominios y borrar la tienda', area: 'Configuración', sensitive: true },
];

const AREAS = ['Ventas', 'Catálogo', 'Clientes', 'Marketing', 'Facturación', 'Configuración'];

/**
 * La columna de la izquierda queda fija al scrollear de costado. En una tabla
 * angosta, sin esto se ve una columna de tildes sin saber a qué permiso
 * corresponde cada fila. Fondo opaco para que el resto pase por abajo.
 */
const STICKY_LABEL = 'sticky left-0 bg-surface text-left';
/** Los bordes van por celda (la tabla usa border-separate). */
const HEAD_LINE = 'border-b border-border';
const ROW_LINE = 'border-b border-border/60';

/** Permisos que conviene señalar en la fila de cada persona. */
export const SENSITIVE_KEYS = PERMISSIONS.filter((p) => p.sensitive).map((p) => p.key);

export function usePermissionMatrix() {
  return useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => api.get<{ items: RoleRow[]; all: string[] }>('/api/v1/members/roles'),
    // La matriz es política de producto: cambia con un deploy, no durante la sesión.
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Qué puede hacer cada rol, lado a lado.
 *
 * Los datos salen del backend, de la MISMA matriz que decide los permisos en
 * cada request. Antes esta pantalla resumía cada rol en tres palabras
 * ("ventas, clientes y chat"), que no alcanzan para decidir a quién darle qué:
 * no se sabía si un vendedor podía devolver plata o ver las ganancias.
 */
export function RolePermissionsMatrix({
  roleLabels,
  onClose,
}: {
  roleLabels: Record<string, string>;
  onClose: () => void;
}) {
  const { data, isLoading } = usePermissionMatrix();
  const roles = data?.items ?? [];

  return (
    <Modal open size="xl" onClose={onClose} title="Qué puede hacer cada rol">
      {isLoading ? (
        <p className="py-8 text-center text-sm text-fg-muted">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Lo que no está tildado, no se puede: quien tenga ese rol ni siquiera ve la opción en el panel.
          </p>

          {/* Sin wrapper de scroll propio: el que scrollea es el cuerpo del
              modal, y así los `sticky` de abajo se anclan a algo que se mueve.
              border-separate es lo que hace que los bordes los pinte cada
              celda — con bordes colapsados los pinta la tabla y desaparecen
              debajo de las celdas fijas. */}
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {/* La esquina se fija en los dos ejes, por eso va por encima. */}
                <th className={cn(STICKY_LABEL, 'top-0 z-30 py-2 pr-3 font-medium text-fg-muted', HEAD_LINE)}>
                  Puede…
                </th>
                {roles.map((r) => (
                  <th
                    key={r.role}
                    className={cn(
                      'sticky top-0 z-10 bg-surface px-2 py-2 text-center font-semibold text-fg',
                      HEAD_LINE,
                    )}
                  >
                    {roleLabels[r.role] ?? r.role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((area) => (
                <Fragment key={area}>
                  {/* El nombre del área va en su propia celda y no en un
                      colSpan: una celda del ancho de la tabla no se puede
                      fijar a la izquierda, y al scrollear de costado el
                      renglón quedaba en blanco. */}
                  <tr>
                    <td
                      className={cn(
                        STICKY_LABEL,
                        'z-[1] pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle',
                      )}
                    >
                      {area}
                    </td>
                    <td colSpan={roles.length} className="pb-1 pt-4" />
                  </tr>
                  {PERMISSIONS.filter((p) => p.area === area).map((p) => (
                    <tr key={p.key}>
                      <td className={cn(STICKY_LABEL, 'z-[1] py-1.5 pr-3 text-fg', ROW_LINE)}>
                        {p.label}
                        {p.sensitive && (
                          <span
                            className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning"
                            title="Permiso sensible: puede mover plata o dar más accesos."
                          >
                            sensible
                          </span>
                        )}
                      </td>
                      {roles.map((r) => {
                        const has = r.permissions.includes(p.key);
                        return (
                          <td key={r.role} className={cn('px-2 py-1.5 text-center', ROW_LINE)}>
                            {has ? (
                              <Check
                                className={cn(
                                  'mx-auto h-4 w-4',
                                  p.sensitive ? 'text-warning' : 'text-success',
                                )}
                                aria-label="Sí"
                              />
                            ) : (
                              <Minus className="mx-auto h-4 w-4 text-fg-subtle/40" aria-label="No" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-fg-subtle">
            Nadie puede asignar un rol por encima del suyo, y la tienda no puede quedarse sin dueño.
          </p>
        </div>
      )}
    </Modal>
  );
}
