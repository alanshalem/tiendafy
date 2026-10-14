import { useState } from 'react';
import { CreditCard, Lock, Unplug } from 'lucide-react';
import { Button, FormField, Input, Select, useConfirm, useToast, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { formatDateTime } from '../../lib/format';
import { Helper } from './Helper';
import { ConnectedBadge, ConnectionLoading } from './ConnectionBits';
import { useServerLoad } from '../../lib/useServerLoad';

type Environment = 'SANDBOX' | 'PRODUCTION';

interface PaywayConnectionDto {
  connected: boolean;
  siteId?: string;
  environment?: Environment;
  publicKey?: string;
  hasPrivateKey?: boolean;
  baseUrlOverride?: string | null;
  establishmentName?: string | null;
  installmentOptions?: number[];
  baseUrl?: string;
  isActive?: boolean;
  updatedAtUtc?: string;
}

const PAYWAY_ORANGE = '#ff5000';

/** Planes que se pueden ofrecer. Payway no tiene API de promociones: se eligen a mano. */
const INSTALLMENT_CHOICES = [1, 3, 6, 9, 12, 18];

export function PaywayConnect() {
  const { store } = useStore();
  const { can } = usePermissions();
  const readOnly = !can('payments.write');
  const { toast } = useToast();
  const confirm = useConfirm();

  const [conn, setConn] = useState<PaywayConnectionDto | null>(null);
  const [busy, setBusy] = useState(false);

  const [siteId, setSiteId] = useState('');
  const [environment, setEnvironment] = useState<Environment>('SANDBOX');
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [baseUrlOverride, setBaseUrlOverride] = useState('');
  const [establishmentName, setEstablishmentName] = useState('');
  const [installments, setInstallments] = useState<number[]>([1]);

  const { loading, reload: load } = useServerLoad(
    store?.id ?? null,
    () => api.get<PaywayConnectionDto>('/api/v1/payments/payway/connection'),
    (data) => {
      setConn(data);
      setSiteId(data.siteId ?? '');
      setEnvironment(data.environment ?? 'SANDBOX');
      setPublicKey(data.publicKey ?? '');
      setBaseUrlOverride(data.baseUrlOverride ?? '');
      setEstablishmentName(data.establishmentName ?? '');
      setInstallments(data.installmentOptions?.length ? data.installmentOptions : [1]);
      // La privada nunca vuelve del servidor: el campo arranca vacío y vacío
      // significa "dejá la que está".
      setPrivateKey('');
    },
    () => setConn(null),
  );

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/api/v1/payments/payway/connection', {
        siteId,
        environment,
        publicKey,
        privateKey: privateKey || null,
        baseUrlOverride: baseUrlOverride || null,
        establishmentName: establishmentName || null,
        installmentOptions: installments,
      });
      toast('Payway guardado', { variant: 'success' });
      await load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ ok: boolean; status: number }>('/api/v1/payments/payway/test', {});
      toast(
        result.ok
          ? 'Payway responde correctamente.'
          : `Payway no respondió${result.status ? ` (HTTP ${result.status})` : ''}.`,
        { variant: result.ok ? 'success' : 'error' },
      );
    } catch (err) {
      toast(errMsg(err, 'No se pudo probar la conexión.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar Payway',
      message: 'Se borran las credenciales de esta tienda. El checkout deja de ofrecer pago con Payway.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.delete('/api/v1/payments/payway/connection');
      toast('Payway desconectado', { variant: 'success' });
      await load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desconectar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggleInstallment = (n: number) =>
    setInstallments((current) => {
      const next = current.includes(n) ? current.filter((x) => x !== n) : [...current, n];
      // Siempre tiene que quedar al menos un pago: sin ninguna opción el
      // comprador no podría elegir nada.
      return next.length === 0 ? [1] : next.sort((a, b) => a - b);
    });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: `${PAYWAY_ORANGE}0d` }}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: PAYWAY_ORANGE }}
        >
          <CreditCard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-base font-bold text-fg">Payway</span>
          <p className="text-xs text-fg-muted">
            Cobro con tarjeta de crédito y débito (ex Decidir, de Prisma). El comprador paga sin salir de tu
            tienda.
          </p>
        </div>
        {conn?.connected && <ConnectedBadge />}
      </div>

      <div className="space-y-4 p-5">
        {loading ? (
          <ConnectionLoading />
        ) : (
          <>
            <Helper title="Dónde saco estas credenciales">
              Payway te entrega un número de comercio y dos claves. La <strong>pública</strong> viaja al
              navegador para convertir la tarjeta en un token — es su única función. La{' '}
              <strong>privada</strong> es la que cobra: se guarda cifrada y no se muestra nunca más, ni acá.
            </Helper>

            {/* Los placeholders dicen qué pegar. Antes eran claves de ejemplo
                con forma real y la pantalla parecía tener credenciales ya
                guardadas: alguien podía dar Payway por configurado. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Número de comercio (site ID)">
                <Input
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  placeholder="Ej.: 00012345"
                  disabled={readOnly}
                />
              </FormField>

              <FormField label="Ambiente">
                <Select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as Environment)}
                  disabled={readOnly}
                  options={[
                    { value: 'SANDBOX', label: 'Pruebas (sandbox)' },
                    { value: 'PRODUCTION', label: 'Producción — cobra de verdad' },
                  ]}
                />
              </FormField>
            </div>

            <FormField label="Clave pública">
              <Input
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="Pegá tu clave pública"
                disabled={readOnly}
              />
            </FormField>

            <FormField
              label={conn?.hasPrivateKey ? 'Clave privada (ya cargada)' : 'Clave privada'}
              hint={
                conn?.hasPrivateKey
                  ? 'Dejala vacía para conservar la que está guardada.'
                  : 'Se guarda cifrada. No se puede volver a ver.'
              }
            >
              <Input
                type="password"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder={conn?.hasPrivateKey ? 'Guardada (no se muestra)' : 'Pegá tu clave privada'}
                autoComplete="new-password"
                disabled={readOnly}
              />
            </FormField>

            <FormField
              label="Nombre en el resumen de la tarjeta"
              hint="Lo que ve el comprador en el resumen de su banco."
            >
              <Input
                value={establishmentName}
                onChange={(e) => setEstablishmentName(e.target.value)}
                placeholder="Ej.: MI TIENDA"
                maxLength={60}
                disabled={readOnly}
              />
            </FormField>

            <div>
              <div className="mb-1.5 text-sm font-medium text-fg">Cuotas que ofrecés</div>
              <div className="flex flex-wrap gap-2">
                {INSTALLMENT_CHOICES.map((n) => {
                  const active = installments.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={active}
                      disabled={readOnly}
                      onClick={() => toggleInstallment(n)}
                      className={
                        active
                          ? 'rounded-full border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg'
                          : 'rounded-full border border-border-strong px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-muted'
                      }
                    >
                      {n === 1 ? '1 pago' : `${n} cuotas`}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-fg-subtle">
                Payway no tiene una API de promociones: las cuotas y sus intereses los acordás con Payway y
                los reflejás acá. Estas opciones se muestran sin recargo.
              </p>
            </div>

            <FormField
              label="Host alternativo de la API (opcional)"
              hint="Solo si Payway te indica uno distinto del que corresponde al ambiente."
            >
              <Input
                value={baseUrlOverride}
                onChange={(e) => setBaseUrlOverride(e.target.value)}
                placeholder={conn?.baseUrl ? `Por defecto: ${conn.baseUrl}` : 'https://…'}
                disabled={readOnly}
              />
            </FormField>

            {conn?.connected && (
              <p className="text-xs text-fg-subtle">
                Cobrando contra <span className="font-medium text-fg-muted">{conn.baseUrl}</span>
                {conn.updatedAtUtc && ` · actualizado el ${formatDateTime(conn.updatedAtUtc)}`}
              </p>
            )}

            {environment === 'PRODUCTION' && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  En producción los cobros son reales. Payway tiene que certificar tu integración antes de
                  habilitarte.
                </span>
              </div>
            )}

            {!readOnly && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={save} loading={busy}>
                  Guardar
                </Button>
                {conn?.connected && (
                  <>
                    <Button variant="secondary" onClick={test} disabled={busy}>
                      {busy ? <Spinner inline /> : null} Probar conexión
                    </Button>
                    <Button variant="secondary" onClick={disconnect} disabled={busy}>
                      <Unplug className="h-4 w-4" /> Desconectar
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
