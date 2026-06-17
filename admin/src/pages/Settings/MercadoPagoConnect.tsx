import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronDown,
  Link2,
  Loader2,
  ShieldCheck,
  Unplug,
  Zap,
} from 'lucide-react';
import { Button, cn, useConfirm, useToast } from '@tiendafy/ui';
import { api, ApiRequestError } from '../../lib/api';
import { useStore } from '../../context/StoreContext';

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
      toast(err instanceof ApiRequestError ? err.message : 'No se pudo iniciar la conexión.', { variant: 'error' });
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
      toast(err instanceof ApiRequestError ? err.message : 'No se pudo desconectar.', { variant: 'error' });
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
      toast(err instanceof ApiRequestError ? err.message : 'No se pudo guardar.', { variant: 'error' });
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
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Recomendado</span>
          </div>
          <p className="text-xs text-fg-muted">Cobrá con tarjeta, dinero en cuenta, Rapipago y más. La plata va directo a tu cuenta.</p>
        </div>
        {conn?.connected && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-semibold text-success">
            <BadgeCheck className="h-4 w-4" /> Conectada
          </span>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando estado de la conexión…
          </div>
        ) : conn?.connected ? (
          <ConnectedView
            conn={conn}
            descriptor={descriptor}
            setDescriptor={setDescriptor}
            busy={busy}
            onMode={(m) => savePrefs({ checkoutMode: m })}
            onSaveDescriptor={() => savePrefs({ statementDescriptor: descriptor })}
            onDisconnect={disconnect}
          />
        ) : (
          <DisconnectedView busy={busy} onConnect={connect} />
        )}
      </div>
    </div>
  );
}

function DisconnectedView({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return (
    <div>
      <ul className="mb-4 space-y-2 text-sm text-fg">
        <Bullet>Conectás <strong>tu propia cuenta</strong> — Tiendafy nunca toca tu plata.</Bullet>
        <Bullet>Aceptás todos los medios de pago que ya tengas habilitados en Mercado Pago.</Bullet>
        <Bullet>Cada venta se concilia sola: el estado del pago actualiza el pedido automáticamente.</Bullet>
      </ul>

      <Button onClick={onConnect} disabled={busy} className="w-full sm:w-auto" style={{ background: MP_BLUE }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        Conectá tu cuenta de Mercado Pago
      </Button>

      <Helper title="¿Cómo funciona?">
        Te llevamos a Mercado Pago para que autorices a Tiendafy a cobrar <em>en tu nombre</em>. Volvés acá ya conectado.
        Usamos OAuth oficial: guardamos un token cifrado, nunca tu usuario ni tu contraseña.
      </Helper>

      <Helper title="¿Cómo lo pruebo sin riesgo?">
        Mercado Pago no tiene un “sandbox” aparte: se prueba con <strong>cuentas de prueba</strong>.
        <ol className="ml-4 mt-1 list-decimal space-y-0.5">
          <li>Creá un usuario de prueba <em>vendedor</em> y uno <em>comprador</em> en tu panel de Mercado Pago.</li>
          <li>Conectá el vendedor con el botón de arriba.</li>
          <li>Pagá con las <strong>tarjetas de prueba</strong> (titular <code>APRO</code> aprueba, <code>OTHE</code> rechaza).</li>
        </ol>
        Para que el callback OAuth y los webhooks lleguen a tu máquina, exponé la API con un túnel
        (<code>cloudflared</code> o <code>ngrok</code>) y registrá esa URL pública en tu app de Mercado Pago.
      </Helper>
    </div>
  );
}

function ConnectedView({
  conn,
  descriptor,
  setDescriptor,
  busy,
  onMode,
  onSaveDescriptor,
  onDisconnect,
}: {
  conn: ConnectionDto;
  descriptor: string;
  setDescriptor: (v: string) => void;
  busy: boolean;
  onMode: (m: CheckoutMode) => void;
  onSaveDescriptor: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-fg-muted">Cuenta MP <strong className="text-fg tabular-nums">#{conn.userId}</strong></span>
        {conn.connectedAtUtc && (
          <span className="text-fg-muted">
            Conectada el {new Date(conn.connectedAtUtc).toLocaleDateString('es-AR')}
          </span>
        )}
      </div>

      {/* Modo de cobro */}
      <div>
        <div className="mb-2 text-sm font-semibold text-fg">¿Cómo querés cobrar?</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={conn.checkoutMode === 'PRO'}
            onClick={() => onMode('PRO')}
            icon={<Zap className="h-4 w-4" />}
            title="Checkout Pro"
            tag="Mayor conversión"
            desc="El cliente paga en Mercado Pago y vuelve a tu tienda. Simple y con la mejor tasa de aprobación."
          />
          <ModeCard
            active={conn.checkoutMode === 'API'}
            onClick={() => onMode('API')}
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Checkout on-site"
            tag="En preparación"
            desc="El cliente paga sin salir de tu tienda, con tu diseño. Se activa en una próxima actualización."
          />
        </div>
      </div>

      {/* Descriptor en el resumen de tarjeta */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg">Nombre en el resumen de la tarjeta</label>
        <div className="flex gap-2">
          <input
            value={descriptor}
            maxLength={22}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder="MI MARCA"
            className="h-10 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button variant="secondary" onClick={onSaveDescriptor}>Guardar</Button>
        </div>
        <p className="mt-1 text-xs text-fg-muted">Hasta 22 caracteres. Es lo que ve el comprador en el resumen de su tarjeta.</p>
      </div>

      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={onDisconnect} disabled={busy} className="text-danger hover:bg-danger/10">
          <Unplug className="h-4 w-4" /> Desconectar cuenta
        </Button>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  tag,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  tag: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 text-left transition',
        active ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', active ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg-muted')}>
          {icon}
        </span>
        <span className="font-semibold text-fg">{title}</span>
        <span className="ml-auto rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">{tag}</span>
      </div>
      <p className="mt-2 text-xs text-fg-muted">{desc}</p>
    </button>
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

function Helper({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-fg"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3 text-sm leading-relaxed text-fg-muted">{children}</div>}
    </div>
  );
}

