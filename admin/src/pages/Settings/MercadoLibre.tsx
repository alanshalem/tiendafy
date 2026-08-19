import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Store } from 'lucide-react';
import { Button, Input, Switch, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { HelpLink } from '../../components/HelpLink';
import { SettingsHeader } from './SettingsLayout';
import { SETTINGS_CARD } from '../../lib/styles';

interface MeliConnection {
  available: boolean;
  connected: boolean;
  nickname: string | null;
  meliUserId: number | null;
  siteId: string | null;
  stockSyncEnabled: boolean;
  stockBufferUnits: number;
  autoInvoiceEnabled: boolean;
  connectedAtUtc: string | null;
}

/**
 * Conexión de la tienda con Mercado Libre (OAuth de la app de plataforma).
 * Al conectar, el panel muestra ventas/preguntas/mensajes de ML y puede
 * sincronizar stock con las publicaciones vinculadas.
 */
export function MeliSettingsPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [connection, setConnection] = useState<MeliConnection | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<MeliConnection>('/api/v1/admin/meli/connection')
      .then(setConnection)
      .catch(() => setConnection(null));
  }, []);

  useEffect(() => {
    if (store) load();
  }, [store, load]);

  // Resultado del redirect OAuth (?meli=connected|error).
  useEffect(() => {
    const result = params.get('meli');
    if (!result) return;
    if (result === 'connected') toast('¡Cuenta de Mercado Libre conectada!', { variant: 'success' });
    else toast('No se pudo conectar la cuenta de Mercado Libre.', { variant: 'error' });
    params.delete('meli');
    setParams(params, { replace: true });
    load();
  }, [params, setParams, toast, load]);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ authUrl: string }>('/api/v1/admin/meli/connect', {});
      window.location.href = res.authUrl;
    } catch (err) {
      toast(errMsg(err, 'No se pudo iniciar la conexión.'), { variant: 'error' });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar Mercado Libre',
      message:
        'El panel deja de mostrar tus ventas y mensajes de Mercado Libre y se apaga la sincronización de stock. Tus publicaciones en Mercado Libre no se tocan.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/api/v1/admin/meli/connection');
      toast('Cuenta desconectada', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desconectar.'), { variant: 'error' });
    }
  };

  const saveSettings = async (patch: {
    stockSyncEnabled?: boolean;
    stockBufferUnits?: number;
    autoInvoiceEnabled?: boolean;
  }) => {
    if (!connection) return;
    try {
      const body = {
        stockSyncEnabled: patch.stockSyncEnabled ?? connection.stockSyncEnabled,
        stockBufferUnits: patch.stockBufferUnits ?? connection.stockBufferUnits,
        autoInvoiceEnabled: patch.autoInvoiceEnabled ?? connection.autoInvoiceEnabled,
      };
      await api.put('/api/v1/admin/meli/settings', body);
      setConnection((c) => (c ? { ...c, ...body } : c));
      toast('Configuración guardada', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    }
  };

  const refreshOrders = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ imported: number }>('/api/v1/admin/meli/orders/refresh', {});
      toast(`Se importaron ${res.imported} ventas de Mercado Libre.`, { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudieron importar las ventas.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!connection) return null;

  return (
    <div>
      <SettingsHeader
        title="Mercado Libre"
        description="Conectá tu cuenta de vendedor: tus ventas, preguntas y mensajes de Mercado Libre en el panel, con stock unificado."
      />
      <div className={SETTINGS_CARD}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-fg">Mercado Libre</span>
              {connection.connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">
                  <CheckCircle2 className="h-3 w-3" /> Conectado como {connection.nickname}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-fg-muted">
              {connection.connected
                ? `Cuenta ${connection.meliUserId} (${connection.siteId}). Tus ventas, preguntas y mensajes de Mercado Libre se ven en el panel, y el stock se puede sincronizar con tus publicaciones.`
                : 'Conectá tu cuenta de vendedor y mirá tus ventas, preguntas y mensajes de Mercado Libre sin salir de acá. Vinculando publicaciones, el stock queda unificado entre los dos canales.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {connection.connected ? (
              <Button variant="secondary" onClick={disconnect}>
                Desconectar
              </Button>
            ) : (
              <Button onClick={connect} disabled={busy || !connection.available}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Conectar mi cuenta
              </Button>
            )}
          </div>
        </div>

        {!connection.available && !connection.connected && (
          <p className="mt-3 rounded-lg bg-bg-muted px-3 py-2 text-sm text-fg-muted">
            La integración todavía no está configurada en esta plataforma (faltan las credenciales de la app
            de Mercado Libre en el servidor).
          </p>
        )}

        {connection.connected && (
          <div className="mt-5 space-y-4 border-t border-border pt-4">
            <Switch
              checked={connection.stockSyncEnabled}
              onChange={(enabled) => saveSettings({ stockSyncEnabled: enabled })}
              label="Sincronizar stock con Mercado Libre"
              description="Cada venta en ML descuenta stock acá, y los cambios de stock locales se empujan a las publicaciones vinculadas (cada ~5 minutos)."
            />
            <div className="flex items-center gap-3">
              <div className="w-24">
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  defaultValue={connection.stockBufferUnits}
                  onBlur={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    if (v !== connection.stockBufferUnits) saveSettings({ stockBufferUnits: v });
                  }}
                />
              </div>
              <div className="text-sm">
                <p className="font-medium text-fg">Colchón anti-sobreventa (unidades)</p>
                <p className="text-fg-muted">
                  En ML se publica stock − colchón: absorbe la ventana entre una venta local y el aviso a ML.
                  0 = publicar todo el stock.
                </p>
              </div>
            </div>
            <Switch
              checked={connection.autoInvoiceEnabled}
              onChange={(enabled) => saveSettings({ autoInvoiceEnabled: enabled })}
              label="Facturar automáticamente las ventas de ML"
              description="Cada venta pagada que se importa emite su comprobante ARCA a consumidor final (necesita la facturación configurada). Si ARCA falla, queda el botón Facturar manual."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={refreshOrders} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Importar últimas ventas
              </Button>
              <Link
                to="/mercadolibre"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ir al panel de Mercado Libre <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>

      <HelpLink id="mercadolibre" />
    </div>
  );
}
