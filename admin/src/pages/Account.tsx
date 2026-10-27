import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, KeyRound, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, FormField, Input, Modal, PageHeader, useToast } from '@tiendafy/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiRequestError } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { downloadBlob } from '../lib/download';
import { HelpLink } from '../components/HelpLink';

interface TwoFactorStatus {
  enabled: boolean;
  /** Null mientras no se sabe (se muestra sin la cuenta). */
  recoveryCodesLeft: number | null;
}

interface TwoFactorSetup {
  sharedKey?: string;
  authenticatorUri?: string;
  qrSvg?: string;
}

interface RecoveryCodes {
  recoveryCodes?: string[];
}

/** Para confirmar que es la persona: su contraseña o un código. */
type Confirmation = { password: string } | { code: string };

const problem = (e: unknown, fallback: string) => (e instanceof ApiRequestError ? e.error.message : fallback);

/**
 * "Mi cuenta": lo de la persona, no de una tienda. Hoy, la verificación en
 * dos pasos (un código de la app de autenticación además de la contraseña).
 */
export function AccountPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Mi cuenta" subtitle={user?.email} />
      <TwoFactorCard />
    </div>
  );
}

function TwoFactorCard() {
  const { user, setTwoFactorEnabled } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState<'disable' | 'regenerate' | null>(null);

  const { data } = useQuery({
    queryKey: qk.twoFactor(),
    queryFn: () => api.get<TwoFactorStatus>('/api/v1/auth/2fa'),
  });
  // Sin la respuesta todavía, lo que dice la sesión.
  const status: TwoFactorStatus = data ?? { enabled: !!user?.twoFactorEnabled, recoveryCodesLeft: null };

  const refresh = (enabled: boolean) => {
    setTwoFactorEnabled(enabled);
    void queryClient.invalidateQueries({ queryKey: qk.twoFactor() });
  };

  const start = useMutation({
    mutationFn: () => api.post<TwoFactorSetup>('/api/v1/auth/2fa/setup', {}),
    onSuccess: setSetup,
    onError: (e) => toast(problem(e, 'No se pudo empezar. Probá de nuevo.'), { variant: 'error' }),
  });

  const showCodes = (r: RecoveryCodes) => setCodes(r.recoveryCodes ?? []);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-fg-muted" aria-hidden="true" /> Verificación en dos pasos
        </span>
      }
      action={
        status.enabled ? <Badge variant="success">Activa</Badge> : <Badge variant="neutral">Inactiva</Badge>
      }
    >
      {codes ? (
        <RecoveryCodesView codes={codes} onDone={() => setCodes(null)} />
      ) : setup ? (
        <SetupView
          setup={setup}
          onCancel={() => setSetup(null)}
          onEnabled={(r) => {
            setSetup(null);
            refresh(true);
            showCodes(r);
            toast('Listo: la verificación en dos pasos quedó activa.', { variant: 'success' });
          }}
        />
      ) : status.enabled ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Para entrar al panel, además de la contraseña te pedimos el código de 6 dígitos de tu app de
            autenticación.
            {status.recoveryCodesLeft !== null && (
              <>
                {' '}
                Te {status.recoveryCodesLeft === 1 ? 'queda' : 'quedan'}{' '}
                <strong className="text-fg">{status.recoveryCodesLeft}</strong>{' '}
                {status.recoveryCodesLeft === 1 ? 'código' : 'códigos'} de recuperación.
              </>
            )}
          </p>
          {status.recoveryCodesLeft !== null && status.recoveryCodesLeft <= 3 && (
            <p role="status" className="rounded-md bg-warning/10 p-3 text-sm text-fg">
              Te quedan pocos códigos de recuperación. Generá nuevos y guardalos en un lugar seguro.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirming('regenerate')}>
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Generar códigos nuevos
            </Button>
            <Button variant="danger" onClick={() => setConfirming('disable')}>
              Desactivar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Sumá un segundo paso al entrar: además de la contraseña, un código que cambia cada 30 segundos en
            una app de tu teléfono (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Si
            alguien consigue tu contraseña, sin tu teléfono no entra.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={start.isPending} onClick={() => start.mutate()}>
              Activar
            </Button>
            <HelpLink id="dosPasos" className="mt-0 w-auto" />
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmIdentityModal
          action={confirming}
          onClose={() => setConfirming(null)}
          onDone={(r) => {
            setConfirming(null);
            if (confirming === 'disable') {
              refresh(false);
              toast('Desactivaste la verificación en dos pasos.', { variant: 'success' });
            } else {
              refresh(true);
              showCodes(r);
            }
          }}
        />
      )}
    </Card>
  );
}

/** Paso a paso para activarla: escanear el QR (o tipear la clave) y confirmar con un código. */
function SetupView({
  setup,
  onCancel,
  onEnabled,
}: {
  setup: TwoFactorSetup;
  onCancel: () => void;
  onEnabled: (r: RecoveryCodes) => void;
}) {
  const [code, setCode] = useState('');
  const enable = useMutation({
    mutationFn: () => api.post<RecoveryCodes>('/api/v1/auth/2fa/enable', { code }),
    onSuccess: onEnabled,
    // El error se muestra en el campo.
    meta: { errorShown: true },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    enable.mutate();
  };

  return (
    <div className="space-y-5">
      <ol className="space-y-5 text-sm text-fg">
        <li>
          <p className="font-medium">1. Escaneá este código con la app de autenticación de tu teléfono.</p>
          {setup.qrSvg && (
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`}
              alt="Código QR para agregar tu cuenta a la app de autenticación"
              className="mt-3 h-44 w-44 rounded-md border border-border bg-white p-1"
            />
          )}
          <p className="mt-3 text-fg-muted">
            ¿No podés escanearlo? En la app elegí “Ingresar clave” y escribí:
          </p>
          <code className="mt-1 inline-block rounded-md bg-bg-muted px-2 py-1 font-mono text-sm tracking-wide break-all text-fg">
            {setup.sharedKey}
          </code>
        </li>
        <li>
          <p className="font-medium">2. Escribí el código de 6 dígitos que te muestra la app.</p>
          <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
            <FormField
              label="Código de la app"
              error={enable.isError ? problem(enable.error, 'No se pudo activar.') : undefined}
              className="w-44"
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={7}
                required
              />
            </FormField>
            <div className="flex gap-2 sm:mt-6">
              <Button type="submit" loading={enable.isPending} disabled={code.trim().length < 6}>
                Confirmar y activar
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </li>
      </ol>
    </div>
  );
}

/** Los códigos de recuperación: se ven esta única vez. */
function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { toast } = useToast();
  const text = codes.join('\n');

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-fg">Guardá tus códigos de recuperación</h4>
        <p className="mt-1 text-sm text-fg-muted">
          Si perdés el teléfono, con uno de estos códigos entrás en lugar del de la app. Cada uno sirve una
          sola vez. <strong className="text-fg">No los vas a volver a ver:</strong> descargalos o copialos
          ahora y guardalos fuera de esta computadora (en tu gestor de contraseñas, por ejemplo).
        </p>
      </div>
      <ul
        aria-label="Códigos de recuperación"
        className="grid grid-cols-2 gap-2 rounded-md bg-bg-muted p-3 font-mono text-sm text-fg sm:grid-cols-5"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            toast('Copiados.', { variant: 'success' });
          }}
        >
          <Copy className="h-4 w-4" aria-hidden="true" /> Copiar
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            downloadBlob(
              new Blob([`${text}\n`], { type: 'text/plain' }),
              'tiendafy-codigos-de-recuperacion.txt',
            )
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Descargar
        </Button>
        <Button onClick={onDone}>Ya los guardé</Button>
      </div>
    </div>
  );
}

/**
 * Desactivar o renovar los códigos pide confirmar que es la persona: la
 * contraseña o un código (de la app o de recuperación). Una sesión abierta
 * en una compu ajena no alcanza para sacarle el segundo paso a nadie.
 */
function ConfirmIdentityModal({
  action,
  onClose,
  onDone,
}: {
  action: 'disable' | 'regenerate';
  onClose: () => void;
  onDone: (r: RecoveryCodes) => void;
}) {
  const fid = useId();
  const [withCode, setWithCode] = useState(false);
  const [value, setValue] = useState('');
  const confirm = useMutation({
    mutationFn: (body: Confirmation) =>
      action === 'disable'
        ? api.post<RecoveryCodes>('/api/v1/auth/2fa/disable', body)
        : api.post<RecoveryCodes>('/api/v1/auth/2fa/recovery-codes', body),
    onSuccess: (r) => onDone(r ?? {}),
    meta: { errorShown: true },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    confirm.mutate(withCode ? { code: value } : { password: value });
  };

  const disabling = action === 'disable';
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={disabling ? 'Desactivar la verificación en dos pasos' : 'Generar códigos de recuperación nuevos'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={`${fid}-form`}
            variant={disabling ? 'danger' : 'primary'}
            loading={confirm.isPending}
            disabled={!value.trim()}
          >
            {disabling ? 'Desactivar' : 'Generar'}
          </Button>
        </div>
      }
    >
      <form id={`${fid}-form`} onSubmit={submit} className="space-y-3">
        <p className="text-sm text-fg-muted">
          {disabling
            ? 'Vas a entrar solo con la contraseña. Para confirmar que sos vos:'
            : 'Los códigos que tenés dejan de servir. Para confirmar que sos vos:'}
        </p>
        <FormField
          // La key rearma el campo al cambiar de contraseña a código.
          key={withCode ? 'code' : 'password'}
          label={withCode ? 'Código de la app o de recuperación' : 'Tu contraseña'}
          error={confirm.isError ? problem(confirm.error, 'No se pudo confirmar.') : undefined}
        >
          <Input
            type={withCode ? 'text' : 'password'}
            autoComplete={withCode ? 'one-time-code' : 'current-password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </FormField>
        <button
          type="button"
          onClick={() => {
            setWithCode(!withCode);
            setValue('');
            confirm.reset();
          }}
          className="text-sm text-primary hover:underline"
        >
          {withCode ? 'Usar la contraseña' : 'Usar un código en vez de la contraseña'}
        </button>
      </form>
    </Modal>
  );
}
