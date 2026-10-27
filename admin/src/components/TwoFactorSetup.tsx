import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Download, ShieldCheck } from 'lucide-react';
import { Button, FormField, Input, useToast } from '@tiendafy/ui';
import type { AdminUser } from '../context/AuthContext';
import { api, ApiRequestError } from '../lib/api';
import { downloadBlob } from '../lib/download';

/** Lo que devuelve la API para vincular una app: la clave, el link otpauth:// y el QR. */
export interface TwoFactorSetup {
  sharedKey?: string;
  authenticatorUri?: string;
  qrSvg?: string;
}

export interface RecoveryCodes {
  recoveryCodes?: string[];
}

/** Lo que responde /auth/2fa/enable: los códigos y, ya con la sesión abierta, la persona. */
export interface EnableResult extends RecoveryCodes {
  user?: AdminUser;
}

export const problem = (e: unknown, fallback: string) =>
  e instanceof ApiRequestError ? e.error.message : fallback;

/**
 * Paso a paso para vincular la app: escanear el QR (o tipear la clave) y
 * confirmar con un código. Lo usan "Mi cuenta" (activarla y pasarla a otra
 * app) y la configuración obligatoria al entrar.
 */
export function SetupView<T>({
  setup,
  askPassword = true,
  confirm,
  onConfirmed,
  confirmLabel = 'Confirmar y activar',
  onCancel,
  cancelLabel = 'Cancelar',
  onExpired,
}: {
  setup: TwoFactorSetup;
  /**
   * Pedir la contraseña junto con el código. Activarla la pide: con una sesión
   * abierta en una compu ajena, otro podría activarla con su teléfono y dejarte
   * afuera de tu cuenta. No se pide si ya se sabe (el login recién hecho) o si
   * ya se confirmó antes (pasarla a otra app).
   */
  askPassword?: boolean;
  confirm: (code: string, password: string) => Promise<T>;
  onConfirmed: (r: T) => void;
  confirmLabel?: string;
  onCancel: () => void;
  cancelLabel?: string;
  /** El paso intermedio del login venció (401): hay que volver a la contraseña. */
  onExpired?: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => confirm(code, password),
    onSuccess: onConfirmed,
    onError: (e) => {
      if (onExpired && e instanceof ApiRequestError && e.status === 401)
        onExpired(problem(e, 'Pasó demasiado tiempo. Volvé a ingresar tu contraseña.'));
    },
    // El error se muestra en el campo.
    meta: { errorShown: true },
  });
  const error = mutation.isError ? problem(mutation.error, 'No se pudo activar.') : undefined;
  const errorCode = mutation.error instanceof ApiRequestError ? mutation.error.error.code : null;
  const passwordError =
    askPassword && (errorCode === 'Auth.InvalidPassword' || errorCode === 'Auth.PasswordRequired');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
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
          <p className="font-medium">
            {askPassword
              ? '2. Escribí el código de 6 dígitos que te muestra la app y, para confirmar que sos vos, tu contraseña.'
              : '2. Escribí el código de 6 dígitos que te muestra la app.'}
          </p>
          <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
            <FormField label="Código de la app" error={passwordError ? undefined : error} className="w-44">
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
            {askPassword && (
              <FormField label="Tu contraseña" error={passwordError ? error : undefined} className="w-56">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </FormField>
            )}
            <div className="flex gap-2 sm:mt-6">
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={code.trim().length < 6 || (askPassword && password.length === 0)}
              >
                {confirmLabel}
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                {cancelLabel}
              </Button>
            </div>
          </form>
        </li>
      </ol>
    </div>
  );
}

/** Los códigos de recuperación: se ven esta única vez. */
export function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
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
 * La verificación en dos pasos obligatoria (dueños y administradores): la
 * pantalla que aparece al entrar, o con la sesión abierta cuando la API dice
 * que falta (Auth.TwoFactorSetupRequired), antes de dejar usar el panel.
 */
export function RequiredTwoFactorSetup({
  password,
  onDone,
  onExit,
  exitLabel,
  onExpired,
}: {
  /** La contraseña que se acaba de escribir en el login: no se vuelve a pedir. */
  password?: string;
  /** Activada y con los códigos guardados; la persona, si la API la devolvió. */
  onDone: (user: AdminUser | undefined) => void;
  onExit: () => void;
  exitLabel: string;
  onExpired?: (message: string) => void;
}) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [result, setResult] = useState<EnableResult | null>(null);
  const start = useMutation({
    mutationFn: () => api.post<TwoFactorSetup>('/api/v1/auth/2fa/setup', {}),
    onSuccess: setSetup,
    onError: (e) => {
      if (onExpired && e instanceof ApiRequestError && e.status === 401)
        onExpired(problem(e, 'Pasó demasiado tiempo. Volvé a ingresar tu contraseña.'));
    },
    meta: { errorShown: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Activá la verificación en dos pasos
        </h1>
        {!result && (
          <p className="mt-1 text-sm text-fg-muted">
            Para dueños y administradores es obligatoria: además de la contraseña, vas a entrar con un código
            que cambia cada 30 segundos en una app de tu teléfono (Google Authenticator, Microsoft
            Authenticator, Authy, 1Password…). Si alguien consigue tu contraseña, sin tu teléfono no entra.
          </p>
        )}
      </div>

      {result ? (
        <RecoveryCodesView codes={result.recoveryCodes ?? []} onDone={() => onDone(result.user)} />
      ) : setup ? (
        <SetupView
          setup={setup}
          askPassword={password === undefined}
          confirm={(code, typed) =>
            api.post<EnableResult>('/api/v1/auth/2fa/enable', { code, password: password ?? typed })
          }
          onConfirmed={setResult}
          onCancel={onExit}
          cancelLabel={exitLabel}
          onExpired={onExpired}
        />
      ) : (
        <div className="space-y-3">
          {start.isError && (
            <p role="alert" className="text-sm text-danger">
              {problem(start.error, 'No se pudo empezar. Probá de nuevo.')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={start.isPending} onClick={() => start.mutate()}>
              Empezar
            </Button>
            <Button variant="ghost" onClick={onExit}>
              {exitLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
