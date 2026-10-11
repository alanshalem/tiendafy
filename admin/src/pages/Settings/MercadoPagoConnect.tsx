import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, Link2, Loader2, Lock, ShieldCheck, Unplug, Zap } from 'lucide-react';
import { Button, cn, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { formatDate } from '../../lib/format';
import { Helper } from './Helper';
import { ConnectedBadge, ConnectionLoading } from './ConnectionBits';
import { BRAND } from '../../lib/runtime';

type CheckoutMode = 'PRO' | 'API';

interface ConnectionDto {
  connected: boolean;
  userId: number | null;
  checkoutMode: CheckoutMode;
  marketplaceFeePercent: number;
  statementDescriptor: string | null;
  tokenExpiresAtUtc: string | null;
  connectedAtUtc: string | null;
}

const MP_BLUE = '#009ee3';

export function MercadoPagoConnect() {
  const { store } = useStore();
  const { can } = usePermissions();
  // Sin payments.write: puede VER el estado de la conexión pero no modificar nada.
  const readOnly = !can('payments.write');
  const { toast } = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const [conn, setConn] = useState<ConnectionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [descriptor, setDescriptor] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ConnectionDto>('/api/v1/payments/mercadopago/connection');
      setConn(data);
      setDescriptor(data.statementDescriptor ?? '');
    } catch {
      setConn(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (store) load();
  }, [store, load]);

  // Volvemos del OAuth con ?mp=connected|error → avisar y limpiar la URL.
  useEffect(() => {
    const mp = params.get('mp');
    if (!mp) return;
    if (mp === 'connected') toast('¡Cuenta de Mercado Pago conectada!', { variant: 'success' });
    else toast('No se pudo conectar Mercado Pago. Reintentá.', { variant: 'error' });
    params.delete('mp');
    setParams(params, { replace: true });
  }, [params, setParams, toast]);

  const connect = async () => {
    setBusy(true);
    try {
      const { authUrl } = await api.post<{ authUrl: string }>('/api/v1/payments/mercadopago/connect', {});
      window.location.href = authUrl;
    } catch (err) {
      toast(errMsg(err, 'No se pudo iniciar la conexión.'), {
        variant: 'error',
      });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar Mercado Pago',
      message: 'Vas a dejar de cobrar con esta cuenta. Podés reconectarla cuando quieras.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.delete('/api/v1/payments/mercadopago/connection');
      toast('Cuenta desconectada', { variant: 'success' });
      await load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desconectar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async (patch: { checkoutMode?: CheckoutMode; statementDescriptor?: string }) => {
    try {
      const updated = await api.put<ConnectionDto>('/api/v1/payments/mercadopago/preferences', {
        checkoutMode: patch.checkoutMode ?? conn?.checkoutMode,
        statementDescriptor: patch.statementDescriptor ?? descriptor,
        marketplaceFeePercent: null,
      });
      setConn(updated);
      toast('Preferencias guardadas', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* Cabecera con marca */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: `${MP_BLUE}0d` }}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white"
          style={{ background: MP_BLUE }}
        >
          MP
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-fg">Mercado Pago</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Recomendado
            </span>
          </div>
          <p className="text-xs text-fg-muted">
            Cobrá con tarjeta, dinero en cuenta, Rapipago y más. La plata va directo a tu cuenta.
          </p>
        </div>
        {conn?.connected && <ConnectedBadge />}
      </div>

      <div className="p-5">
        {loading ? (
          <ConnectionLoading />
        ) : conn?.connected ? (
          <ConnectedView
            conn={conn}
            descriptor={descriptor}
            setDescriptor={setDescriptor}
            busy={busy}
            readOnly={readOnly}
            onMode={(m) => savePrefs({ checkoutMode: m })}
            onSaveDescriptor={() => savePrefs({ statementDescriptor: descriptor })}
            onDisconnect={disconnect}
          />
        ) : (
          <DisconnectedView busy={busy} readOnly={readOnly} onConnect={connect} />
        )}
      </div>
    </div>
  );
}

/** Aviso de modo solo lectura (rol sin payments.write). */
function ReadOnlyNote() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-bg-muted/60 px-3 py-2 text-xs text-fg-muted">
      <Lock className="h-3.5 w-3.5 shrink-0" />
      Solo lectura: tu rol no puede modificar los pagos.
    </div>
  );
}

function DisconnectedView({
  busy,
  readOnly,
  onConnect,
}: {
  busy: boolean;
  readOnly: boolean;
  onConnect: () => void;
}) {
  return (
    <div>
      <ul className="mb-4 space-y-2 text-sm text-fg">
        <Bullet>
          Conectás <strong>tu propia cuenta</strong> — {BRAND} nunca toca tu plata.
        </Bullet>
        <Bullet>Aceptás todos los medios de pago que ya tengas habilitados en Mercado Pago.</Bullet>
        <Bullet>Cada venta se concilia sola: el estado del pago actualiza el pedido automáticamente.</Bullet>
      </ul>

      {readOnly ? (
        <ReadOnlyNote />
      ) : (
        <Button
          onClick={onConnect}
          disabled={busy}
          className="w-full sm:w-auto"
          style={{ background: MP_BLUE }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Conectá tu cuenta de Mercado Pago
        </Button>
      )}

      <Helper title="¿Cómo funciona?">
        Te llevamos a Mercado Pago para que autorices a {BRAND} a cobrar <em>en tu nombre</em>. Volvés acá ya
        conectado. Usamos OAuth oficial: guardamos un token cifrado, nunca tu usuario ni tu contraseña.
      </Helper>

      <Helper title="¿Cómo lo pruebo sin riesgo?">
        Mercado Pago no tiene un “sandbox” aparte: se prueba con <strong>cuentas de prueba</strong>.
        <ol className="ml-4 mt-1 list-decimal space-y-0.5">
          <li>
            Creá un usuario de prueba <em>vendedor</em> y uno <em>comprador</em> en tu panel de Mercado Pago.
          </li>
          <li>Conectá el vendedor con el botón de arriba.</li>
          <li>
            Pagá con las <strong>tarjetas de prueba</strong> (titular <code>APRO</code> aprueba,{' '}
            <code>OTHE</code> rechaza).
          </li>
        </ol>
        Para que el callback OAuth y los webhooks lleguen a tu máquina, exponé la API con un túnel (
        <code>cloudflared</code> o <code>ngrok</code>) y registrá esa URL pública en tu app de Mercado Pago.
      </Helper>
    </div>
  );
}

function ConnectedView({
  conn,
  descriptor,
  setDescriptor,
  busy,
  readOnly,
  onMode,
  onSaveDescriptor,
  onDisconnect,
}: {
  conn: ConnectionDto;
  descriptor: string;
  setDescriptor: (v: string) => void;
  busy: boolean;
  readOnly: boolean;
  onMode: (m: CheckoutMode) => void;
  onSaveDescriptor: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="space-y-5">
      {readOnly && <ReadOnlyNote />}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-fg-muted">
          Cuenta MP <strong className="text-fg tabular-nums">#{conn.userId}</strong>
        </span>
        {conn.connectedAtUtc && (
          <span className="text-fg-muted">Conectada el {formatDate(conn.connectedAtUtc)}</span>
        )}
      </div>

      {/* Modo de cobro */}
      <div>
        <div className="mb-2 text-sm font-semibold text-fg">¿Cómo querés cobrar?</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={conn.checkoutMode === 'PRO'}
            disabled={readOnly}
            onClick={() => onMode('PRO')}
            icon={<Zap className="h-4 w-4" />}
            title="Checkout Pro"
            tag="Recomendado para empezar"
            desc="El cliente paga en la página de Mercado Pago y vuelve a tu tienda. Cero fricción para arrancar y la mejor tasa de aprobación."
            preview={<PreviewPro />}
          />
          <ModeCard
            active={conn.checkoutMode === 'API'}
            disabled={readOnly}
            onClick={() => onMode('API')}
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Checkout integrado"
            tag="Experiencia premium"
            desc="El cliente carga su tarjeta sin salir de tu tienda, con tu diseño. Más control sobre la experiencia de compra."
            preview={<PreviewApi />}
          />
        </div>

        <Helper title="¿Cuál me conviene? Comparación completa">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium text-fg-muted" />
                  <th className="py-2 pr-3 font-semibold text-fg">Checkout Pro</th>
                  <th className="py-2 font-semibold text-fg">Checkout integrado</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2 [&_td]:pr-3 [&_tr]:border-b [&_tr]:border-border/60">
                <tr>
                  <td className="font-medium text-fg-muted">Dónde paga el cliente</td>
                  <td>En la página de Mercado Pago (sale de tu tienda y vuelve)</td>
                  <td>Dentro de tu tienda, sin redirecciones</td>
                </tr>
                <tr>
                  <td className="font-medium text-fg-muted">Diseño</td>
                  <td>El de Mercado Pago (conocido por el comprador)</td>
                  <td>El de tu tienda (colores y marca propios)</td>
                </tr>
                <tr>
                  <td className="font-medium text-fg-muted">Medios de pago</td>
                  <td>Todos: tarjetas, dinero en cuenta, Rapipago, Pago Fácil, cuotas</td>
                  <td>Tarjetas de crédito y débito (con cuotas)</td>
                </tr>
                <tr>
                  <td className="font-medium text-fg-muted">Tasa de aprobación</td>
                  <td>La más alta (el comprador ya está logueado en MP)</td>
                  <td>Muy buena, puede pedir validación extra (3DS)</td>
                </tr>
                <tr>
                  <td className="font-medium text-fg-muted">Confianza del comprador</td>
                  <td>Alta: paga en un sitio que ya conoce</td>
                  <td>Depende de tu marca: no ve el logo de MP hasta el final</td>
                </tr>
                <tr>
                  <td className="font-medium text-fg-muted">Datos de tarjeta</td>
                  <td colSpan={2}>
                    En ambos casos los procesa Mercado Pago: nunca tocan los servidores de tu tienda (PCI a
                    cargo de MP)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            Podés cambiar de modo cuando quieras: aplica al instante para las compras nuevas, sin tocar nada
            más.
          </p>
        </Helper>
      </div>

      {/* Descriptor en el resumen de tarjeta */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg">Nombre en el resumen de la tarjeta</label>
        <div className="flex gap-2">
          <input
            value={descriptor}
            maxLength={22}
            disabled={readOnly}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder="MI MARCA"
            className="h-10 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-bg-muted disabled:opacity-70"
          />
          {!readOnly && (
            <Button variant="secondary" onClick={onSaveDescriptor}>
              Guardar
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          Hasta 22 caracteres. Es lo que ve el comprador en el resumen de su tarjeta.
        </p>
      </div>

      {!readOnly && (
        <div className="border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={onDisconnect}
            disabled={busy}
            className="text-danger hover:bg-danger/10"
          >
            <Unplug className="h-4 w-4" /> Desconectar cuenta
          </Button>
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  disabled,
  onClick,
  icon,
  title,
  tag,
  desc,
  preview,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  tag: string;
  desc: string;
  preview?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 text-left transition',
        active
          ? 'border-primary bg-primary/[0.04] ring-1 ring-primary'
          : 'border-border hover:border-border-strong',
        disabled && 'cursor-default',
        disabled && !active && 'opacity-60 hover:border-border',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            active ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg-muted',
          )}
        >
          {icon}
        </span>
        <span className="font-semibold text-fg">{title}</span>
        <span className="ml-auto rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">
          {tag}
        </span>
      </div>
      <p className="mt-2 text-xs text-fg-muted">{desc}</p>
      {preview && <div className="mt-3">{preview}</div>}
    </button>
  );
}

/** Mini-mockup de la experiencia Checkout Pro: redirect a mercadopago.com. */
function PreviewPro() {
  return (
    <div className="pointer-events-none select-none overflow-hidden rounded-md border border-border bg-bg-muted/40">
      <div className="flex items-center gap-1.5 border-b border-border bg-bg-muted px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
        <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
        <span className="rounded-sm bg-surface px-1.5 py-px text-[9px] text-fg-muted">
          mercadopago.com.ar
        </span>
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-4 w-4 items-center justify-center rounded-sm text-[7px] font-black text-white"
            style={{ background: MP_BLUE }}
          >
            MP
          </span>
          <div className="h-1.5 w-16 rounded bg-border" />
        </div>
        <div className="h-1.5 w-24 rounded bg-border/70" />
        <div className="h-1.5 w-20 rounded bg-border/70" />
        <div
          className="mt-1 flex h-5 w-full items-center justify-center rounded text-[9px] font-semibold text-white"
          style={{ background: MP_BLUE }}
        >
          Pagar
        </div>
      </div>
    </div>
  );
}

/** Mini-mockup de la experiencia integrada: formulario de tarjeta en tu tienda. */
function PreviewApi() {
  return (
    <div className="pointer-events-none select-none overflow-hidden rounded-md border border-border bg-bg-muted/40">
      <div className="flex items-center gap-1.5 border-b border-border bg-bg-muted px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
        <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
        <span className="rounded-sm bg-surface px-1.5 py-px text-[9px] text-fg-muted">
          mitienda.com.ar/checkout
        </span>
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="h-1.5 w-16 rounded bg-primary/50" />
        <div className="flex h-5 items-center rounded border border-border-strong bg-surface px-1.5 text-[9px] text-fg-muted">
          •••• •••• •••• 4242
        </div>
        <div className="flex gap-1.5">
          <div className="flex h-5 flex-1 items-center rounded border border-border-strong bg-surface px-1.5 text-[9px] text-fg-muted">
            MM/AA
          </div>
          <div className="flex h-5 flex-1 items-center rounded border border-border-strong bg-surface px-1.5 text-[9px] text-fg-muted">
            CVV
          </div>
        </div>
        <div className="mt-1 flex h-5 w-full items-center justify-center rounded bg-primary text-[9px] font-semibold text-primary-fg">
          Pagar en tu tienda
        </div>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}
