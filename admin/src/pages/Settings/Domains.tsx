import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { Check, Copy, ExternalLink, Globe, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { Badge, Button, FormField, Input, Modal, useConfirm, useToast, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { TABLE_CARD, TABLE_HEAD_STICKY_SUBTLE, TABLE_HEAD_TEXT, TABLE_SCROLL_X } from '../../lib/styles';
import { BRAND } from '../../lib/runtime';
import { useModalFormGuard } from '../../lib/useUnsavedChanges';

interface DomainStatus {
  subdomain: string;
  customDomain: string | null;
  platformTarget: string;
  resolves?: boolean;
  /** El dominio propio llega al mismo lugar que la plataforma. */
  pointsHere?: boolean;
  addresses?: string[];
  error?: string | null;
}

export function DomainsPage() {
  const { store } = useStore();
  const { role } = usePermissions();
  // Cambiar el dominio lo permite el backend solo al dueño de la tienda, así
  // que el panel no ofrece el botón a nadie más: mostrarlo solo llevaría a un
  // 403 después de escribir el dominio.
  const canEdit = role === 'owner';
  const { toast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);

  // El estado real sale de resolver el DNS, no de suponerlo: antes esta
  // pantalla decía "Activado · SSL activado" sin consultar nada, y un dominio
  // sin apuntar se veía exactamente igual que uno funcionando.
  const statusQ = useQuery({
    queryKey: ['domain-status', store?.id],
    queryFn: () => api.get<DomainStatus>('/api/v1/tenants/domain-status'),
    enabled: !!store,
    retry: false,
  });

  const status = statusQ.data;

  const remove = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/tenants/${store!.id}`, {
        name: store!.name,
        subdomain: store!.subdomain,
        customDomain: null,
      }),
    onSuccess: () => {
      toast('Dominio propio quitado', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['domain-status'] });
      qc.invalidateQueries({ queryKey: qk.tenants() });
    },
    onError: (e) => toast(errMsg(e, 'No se pudo quitar el dominio.'), { variant: 'error' }),
  });

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast('Copiado', { variant: 'success' });
  };

  return (
    <div className="pb-10">
      <SettingsHeader
        title="Dominios"
        description="La dirección de tu tienda en internet. Podés usar la que te damos o conectar la tuya."
        action={
          canEdit &&
          !status?.customDomain && (
            <Button onClick={() => setEditing(true)}>
              <Globe className="h-4 w-4" /> Conectar mi dominio
            </Button>
          )
        }
      />

      <div className={TABLE_CARD}>
        <div className={TABLE_SCROLL_X}>
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD_STICKY_SUBTLE}>
              <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium text-fg-muted">
                <th className="px-4 py-2.5">Dirección</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Certificado</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {/* El subdominio de Tiendafy siempre funciona: lo resuelve el
                  comodín del DNS de la plataforma, no depende del comerciante. */}
              <tr className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <span className="font-medium text-fg">{status?.subdomain ?? '—'}</span>
                  <span className="ml-2 rounded-full bg-bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
                    Siempre disponible
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="success">
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Funcionando
                    </span>
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="success">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3.5 w-3.5" /> Automático
                    </span>
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {status?.subdomain && (
                    <a
                      href={`https://${status.subdomain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Abrir <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
              </tr>

              {status?.customDomain && (
                <tr className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-fg">{status.customDomain}</span>
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Tuyo
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {statusQ.isFetching ? (
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                        <Spinner inline size={14} /> Verificando…
                      </span>
                    ) : status.pointsHere ? (
                      <Badge variant="success">
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Apuntando bien
                        </span>
                      </Badge>
                    ) : status.resolves ? (
                      <Badge variant="warning">Apunta a otro lado</Badge>
                    ) : (
                      <Badge variant="neutral">Sin apuntar todavía</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {/* El certificado se emite en la primera visita, así que
                        hasta que el DNS no apunte no puede existir. */}
                    {status.pointsHere ? (
                      <Badge variant="success">
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-3.5 w-3.5" /> Automático
                        </span>
                      </Badge>
                    ) : (
                      <span className="text-xs text-fg-subtle">Cuando el dominio apunte</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => statusQ.refetch()}
                        disabled={statusQ.isFetching}
                        className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-bg-muted disabled:opacity-50"
                        aria-label="Volver a verificar"
                        title="Volver a verificar"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Quitar el dominio propio',
                              message: `Tu tienda va a dejar de responder en ${status.customDomain} y va a quedar solo en ${status.subdomain}.`,
                              confirmLabel: 'Quitar',
                              variant: 'danger',
                            });
                            if (ok) remove.mutate();
                          }}
                          className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-danger/10 hover:text-danger"
                          aria-label="Quitar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lo único que el comerciante necesita hacer, y con el valor exacto. */}
      {status?.customDomain && !status.pointsHere && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning-bg/40 p-4">
          <h3 className="text-sm font-semibold text-fg">Falta un paso en tu proveedor de dominios</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Entrá donde compraste <span className="font-medium text-fg">{status.customDomain}</span> (por
            ejemplo NIC.ar, GoDaddy o Cloudflare), buscá la sección de DNS y creá este registro:
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead className={TABLE_HEAD_TEXT}>
                <tr className="text-left text-xs text-fg-subtle">
                  <th className="pb-1 pr-4 font-medium">Tipo</th>
                  <th className="pb-1 pr-4 font-medium">Nombre</th>
                  <th className="pb-1 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-4 font-mono text-fg">CNAME</td>
                  <td className="pr-4 font-mono text-fg">{hostPart(status.customDomain)}</td>
                  <td className="font-mono text-fg">
                    <button
                      onClick={() => copy(status.platformTarget)}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 hover:bg-bg-muted"
                      title="Copiar"
                    >
                      {status.platformTarget} <Copy className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-fg-muted">
            {status.error ??
              (status.resolves
                ? `Hoy tu dominio resuelve a ${(status.addresses ?? []).join(', ')}, que no es nuestro servidor. Revisá si quedó un registro viejo.`
                : 'Los cambios de DNS pueden tardar unas horas en propagarse.')}{' '}
            El certificado de seguridad se genera solo en la primera visita, no hay que pedirlo.
          </p>
        </div>
      )}

      {status?.customDomain && status.pointsHere && (
        <p className="mt-3 text-sm text-fg-muted">
          Tu dominio está apuntando correctamente. Tu tienda responde en{' '}
          <a
            href={`https://${status.customDomain}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {status.customDomain}
          </a>{' '}
          y también en {status.subdomain}.
        </p>
      )}

      {!status?.customDomain && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg">¿Para qué conectar un dominio propio?</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Tu tienda ya funciona en {status?.subdomain ?? `tu dirección de ${BRAND}`}. Un dominio propio
            —tumarca.com.ar— da confianza al comprador y es tuyo: si algún día cambiás de plataforma, te lo
            llevás con vos.
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            Primero compralo en un registrador (NIC.ar para los .com.ar) y después conectalo acá.
          </p>
        </div>
      )}

      {editing && (
        <DomainModal
          storeId={store!.id}
          storeName={store!.name}
          subdomain={store!.subdomain}
          target={status?.platformTarget ?? ''}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ['domain-status'] });
            qc.invalidateQueries({ queryKey: qk.tenants() });
          }}
        />
      )}

      <HelpLink id="domains" />
    </div>
  );
}

/** El nombre que va en el registro DNS: "@" para el dominio raíz, o el subdominio. */
function hostPart(domain: string): string {
  const parts = domain.split('.');
  // tumarca.com.ar → raíz; tienda.tumarca.com.ar → "tienda".
  return parts.length > 3 ? parts[0]! : '@';
}

function DomainModal({
  storeId,
  storeName,
  subdomain,
  target,
  onClose,
  onSaved,
}: {
  storeId: string;
  storeName: string;
  subdomain: string;
  target: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [domain, setDomain] = useState('');
  const { dirty, close } = useModalFormGuard(domain.trim(), onClose);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/tenants/${storeId}`, {
        name: storeName,
        subdomain,
        // Se limpia lo que la gente suele pegar de más: el http:// y la barra
        // final hacen que el dominio no valide y el error no se entiende.
        customDomain: domain
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, ''),
      }),
    onSuccess: () => {
      toast('Dominio conectado. Ahora falta apuntarlo desde tu proveedor.', { variant: 'success' });
      onSaved();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo conectar el dominio.'), { variant: 'error' }),
  });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title="Conectar mi dominio"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!domain.trim()} loading={save.isPending}>
            Conectar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Tu dominio" hint="Sin https:// y sin barra al final.">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="tumarca.com.ar"
            autoFocus
          />
        </FormField>

        <p className="text-sm text-fg-muted">
          Después de conectarlo vas a tener que crear un registro CNAME en tu proveedor de dominios apuntando
          a <span className="font-mono text-fg">{target}</span>. Te mostramos el dato exacto acá mismo, y
          verificamos solos cuando esté listo.
        </p>

        <p className="text-xs text-fg-subtle">
          El dominio tenés que comprarlo vos en un registrador. {BRAND} no vende dominios.
        </p>
      </div>
    </Modal>
  );
}
