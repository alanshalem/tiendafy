import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Link2,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  Store,
} from 'lucide-react';
import { Button, Input, Switch, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { HelpLink } from '../../components/HelpLink';
import { ListStats } from '../../components/stats/ListStats';
import { SettingsHeader } from './SettingsLayout';
import { SETTINGS_CARD } from '../../lib/styles';

interface MeliConnection {
  available: boolean;
  connected: boolean;
  /** Cuenta de ejemplo del sembrador de desarrollo: no hay OAuth detrás. */
  isDemo: boolean;
  nickname: string | null;
  meliUserId: number | null;
  siteId: string | null;
  stockSyncEnabled: boolean;
  stockBufferUnits: number;
  priceSyncEnabled: boolean;
  priceMarkupPct: number;
  autoInvoiceEnabled: boolean;
  connectedAtUtc: string | null;
  /** Publicaciones de ML atadas a una variante del catálogo. */
  linkedItems: number;
  linkedStock: number;
  linkedPrice: number;
  ordersImported: number;
  lastOrderAtUtc: string | null;
  /** Último webhook recibido: es la señal de vida de la integración. */
  lastNotificationAtUtc: string | null;
  stuckNotifications: number;
}

/** "hace 3 días" a partir de una fecha ISO. Null cuando nunca pasó. */
function since(iso: string | null): string {
  if (!iso) return 'Nunca';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Hace un mes' : `Hace ${months} meses`;
}

/**
 * Conexión de la tienda con Mercado Libre (OAuth de la app de plataforma).
 * Al conectar, el panel muestra ventas/preguntas/mensajes de ML y puede
 * sincronizar stock y precios con las publicaciones vinculadas.
 */
export function MeliSettingsPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [connection, setConnection] = useState<MeliConnection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .get<MeliConnection>('/api/v1/admin/meli/connection')
      .then(setConnection)
      // Sin esto, cualquier error de red dejaba la pantalla en blanco y mudo:
      // el `return null` de abajo no distingue "cargando" de "se cayó".
      .catch((err) => {
        setConnection(null);
        setLoadError(errMsg(err, 'No se pudo cargar la conexión con Mercado Libre.'));
      });
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
    priceSyncEnabled?: boolean;
    priceMarkupPct?: number;
    autoInvoiceEnabled?: boolean;
  }) => {
    if (!connection) return;
    try {
      const body = {
        stockSyncEnabled: patch.stockSyncEnabled ?? connection.stockSyncEnabled,
        stockBufferUnits: patch.stockBufferUnits ?? connection.stockBufferUnits,
        priceSyncEnabled: patch.priceSyncEnabled ?? connection.priceSyncEnabled,
        priceMarkupPct: patch.priceMarkupPct ?? connection.priceMarkupPct,
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
      const res = await api.post<{ imported: number; demo: boolean }>(
        '/api/v1/admin/meli/orders/refresh',
        {},
      );
      if (res.demo) toast('Cuenta de ejemplo: no hay nada que traer de Mercado Libre.', { variant: 'info' });
      else if (res.imported === 0) toast('Ya estabas al día: no había ventas nuevas.', { variant: 'info' });
      else toast(`Se importaron ${res.imported} ventas de Mercado Libre.`, { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudieron importar las ventas.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <div>
        <SettingsHeader title="Mercado Libre" description="Conectá tu cuenta de vendedor." />
        <div className={SETTINGS_CARD}>
          <p className="text-sm text-danger">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={load}>
            Reintentar
          </Button>
        </div>
      </div>
    );

  if (!connection) return null;

  const c = connection;
  // Los interruptores de stock y precio solo tocan publicaciones vinculadas:
  // encendidos sin ningún vínculo no hacen absolutamente nada, y hasta ahora
  // la pantalla no lo decía en ningún lado.
  const syncingNothing = (c.stockSyncEnabled || c.priceSyncEnabled) && c.linkedItems === 0;

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
              {c.connected && !c.isDemo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">
                  <CheckCircle2 className="h-3 w-3" /> Conectado como {c.nickname}
                </span>
              )}
              {c.isDemo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
                  <FlaskConical className="h-3 w-3" /> Cuenta de ejemplo
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-fg-muted">
              {c.connected
                ? `Cuenta ${c.meliUserId} (${c.siteId}). Conectada ${
                    c.connectedAtUtc ? `el ${formatDateTime(c.connectedAtUtc)}` : 'hace un rato'
                  }.`
                : 'Conectá tu cuenta de vendedor y mirá tus ventas, preguntas y mensajes de Mercado Libre sin salir de acá. Vinculando publicaciones, el stock queda unificado entre los dos canales.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {c.connected ? (
              <Button variant="secondary" onClick={disconnect}>
                Desconectar
              </Button>
            ) : (
              <Button onClick={connect} disabled={busy || !c.available}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Conectar mi cuenta
              </Button>
            )}
          </div>
        </div>

        {!c.available && !c.connected && (
          <p className="mt-3 rounded-lg bg-bg-muted px-3 py-2 text-sm text-fg-muted">
            La integración todavía no está configurada en esta plataforma (faltan las credenciales de la app
            de Mercado Libre en el servidor).
          </p>
        )}

        {!c.connected && c.available && <WhatYouGet />}

        {c.isDemo && (
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning-bg/40 px-3 py-2 text-sm text-warning">
            Esta cuenta es de demostración: los datos que ves son de ejemplo y nada sale hacia Mercado Libre.
            Para operar de verdad, desconectala y conectá tu cuenta de vendedor.
          </p>
        )}
      </div>

      {c.connected && (
        <>
          <ListStats
            className="mt-4"
            items={[
              {
                label: 'Publicaciones vinculadas',
                value: c.linkedItems.toLocaleString('es-AR'),
                hint: 'Publicaciones de Mercado Libre atadas a una variante de tu catálogo. Es lo único que la sincronización de stock y precios puede tocar.',
                tone: c.linkedItems === 0 ? 'warning' : 'default',
              },
              {
                label: 'Ventas importadas',
                value: c.ordersImported.toLocaleString('es-AR'),
                hint: 'Ventas de Mercado Libre que ya están en el panel.',
              },
              {
                label: 'Última venta',
                value: since(c.lastOrderAtUtc),
                hint: c.lastOrderAtUtc ? formatDateTime(c.lastOrderAtUtc) : 'Todavía no entró ninguna venta.',
              },
              {
                label: 'Último aviso de ML',
                value: since(c.lastNotificationAtUtc),
                hint: c.isDemo
                  ? 'Una cuenta de ejemplo no recibe avisos: no hay nadie del otro lado.'
                  : 'Mercado Libre avisa por webhook cada vez que pasa algo. Si dice "Nunca" y ya vendiste, el webhook no está llegando.',
                // En una cuenta de ejemplo nunca va a llegar un aviso, así que
                // pintarlo de alerta sería avisar de algo que no tiene arreglo.
                tone: !c.isDemo && !c.lastNotificationAtUtc && c.ordersImported > 0 ? 'warning' : 'default',
              },
            ]}
          />

          {c.stuckNotifications > 0 && (
            <Notice tone="danger">
              Hay {c.stuckNotifications} avisos de Mercado Libre que no se pudieron procesar después de varios
              intentos. Puede faltar algún dato de esas ventas: traelas con «Importar últimas ventas».
            </Notice>
          )}

          {syncingNothing && (
            <Notice tone="warning">
              La sincronización está encendida pero no hay ninguna publicación vinculada, así que no va a
              pasar nada. Andá a{' '}
              <Link
                to="/mercadolibre?tab=publicaciones"
                className="font-semibold underline underline-offset-2"
              >
                Publicaciones
              </Link>{' '}
              y atá cada publicación de Mercado Libre a la variante que le corresponde en tu catálogo.
            </Notice>
          )}

          <div className={`${SETTINGS_CARD} mt-4`}>
            <h2 className="text-base font-semibold text-fg">Qué se sincroniza</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Todo esto viaja de tu tienda hacia Mercado Libre, y solo para las {c.linkedItems} publicaciones
              vinculadas.
            </p>

            <div className="mt-4 space-y-4">
              <Switch
                checked={c.stockSyncEnabled}
                onChange={(enabled) => saveSettings({ stockSyncEnabled: enabled })}
                label="Sincronizar stock"
                description="Cada venta en ML descuenta stock acá, y los cambios de stock locales se empujan a las publicaciones vinculadas (cada ~5 minutos)."
              />
              {/* El colchón solo tiene sentido con la sincronización encendida:
                  mostrarlo siempre invitaba a configurar algo que no corría. */}
              {c.stockSyncEnabled && (
                <SubField
                  label="Colchón anti-sobreventa (unidades)"
                  help="En ML se publica stock − colchón: absorbe la ventana entre una venta local y el aviso a ML. 0 = publicar todo el stock."
                >
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    defaultValue={c.stockBufferUnits}
                    onBlur={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      if (v !== c.stockBufferUnits) saveSettings({ stockBufferUnits: v });
                    }}
                  />
                </SubField>
              )}

              <Switch
                checked={c.priceSyncEnabled}
                onChange={(enabled) => saveSettings({ priceSyncEnabled: enabled })}
                label="Sincronizar precios"
                description="Cuando cambiás un precio acá (incluida la repreciación masiva), se actualiza solo en las publicaciones vinculadas. Sin esto, subís precios por inflación y ML sigue vendiendo al precio viejo."
              />
              {c.priceSyncEnabled && (
                <SubField
                  label="Recargo para Mercado Libre (%)"
                  help="ML cobra bastante más comisión que tu tienda: con 15, un producto de $10.000 se publica a $11.500. 0 = mismo precio que en tu tienda."
                >
                  <Input
                    type="number"
                    min={-50}
                    max={200}
                    step="0.5"
                    defaultValue={c.priceMarkupPct}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== c.priceMarkupPct) saveSettings({ priceMarkupPct: v });
                    }}
                  />
                </SubField>
              )}

              <Switch
                checked={c.autoInvoiceEnabled}
                onChange={(enabled) => saveSettings({ autoInvoiceEnabled: enabled })}
                label="Facturar automáticamente las ventas de ML"
                description="Cada venta pagada que se importa emite su comprobante ARCA a consumidor final (necesita la facturación configurada). Si ARCA falla, queda el botón Facturar manual."
              />
            </div>
          </div>

          <div className={`${SETTINGS_CARD} mt-4`}>
            <h2 className="text-base font-semibold text-fg">Dónde se trabaja</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Esta pantalla es solo la configuración. El día a día de Mercado Libre pasa acá:
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Shortcut
                to="/mercadolibre?tab=ventas"
                icon={<Package className="h-4 w-4" />}
                title="Ventas"
                desc="Despachar y facturar"
              />
              <Shortcut
                to="/mercadolibre?tab=publicaciones"
                icon={<Link2 className="h-4 w-4" />}
                title="Publicaciones"
                desc="Vincular y publicar"
              />
              <Shortcut
                to="/mercadolibre?tab=preguntas"
                icon={<MessageCircle className="h-4 w-4" />}
                title="Preguntas"
                desc="Responder al comprador"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button variant="secondary" onClick={refreshOrders} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Importar últimas ventas
              </Button>
              <p className="text-sm text-fg-muted">
                Normalmente no hace falta: Mercado Libre avisa solo. Sirve si sospechás que falta alguna.
              </p>
            </div>
          </div>
        </>
      )}

      <HelpLink id="mercadolibre" />
    </div>
  );
}

/** Aviso de una línea, con el color según cuánto urge. */
function Notice({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
  const cls =
    tone === 'danger'
      ? 'border-danger/40 bg-danger-bg/40 text-danger'
      : 'border-warning/40 bg-warning-bg/40 text-warning';
  return (
    <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Campo que depende de un interruptor: se muestra indentado debajo. */
function SubField({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="ml-1 flex items-start gap-3 border-l-2 border-border pl-4">
      <div className="w-24 shrink-0">{children}</div>
      <div className="text-sm">
        <p className="font-medium text-fg">{label}</p>
        <p className="text-fg-muted">{help}</p>
      </div>
    </div>
  );
}

function Shortcut({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg border border-border bg-bg-subtle px-3 py-2.5 hover:border-primary/40 hover:bg-bg-muted"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-fg-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="block text-xs text-fg-muted">{desc}</span>
      </span>
      <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-subtle" />
    </Link>
  );
}

/** Qué se gana conectando, antes de conectar. */
function WhatYouGet() {
  const items = [
    'Tus ventas de ML en el panel: despachás y facturás desde el mismo lugar que las de tu tienda.',
    'Stock unificado: una venta en ML descuenta del mismo stock que tu tienda, y al revés.',
    'Precios al día en los dos lados, con el recargo que quieras para cubrir la comisión de ML.',
    'Preguntas, mensajes y reclamos sin abrir Mercado Libre.',
  ];
  return (
    <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2 text-sm text-fg-muted">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
