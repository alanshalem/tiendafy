import { useId, useState, type FormEvent } from 'react';
import { Button, Modal } from '@tiendafy/ui';
import { Captcha } from './Captcha';

/**
 * La sesión venció con el panel abierto. Se pide la contraseña ENCIMA de la
 * pantalla, sin desmontarla: lo que se estaba cargando sigue ahí, y después
 * de entrar se repite lo que no se guardó. La contraseña vive solo en este
 * formulario (nunca se guarda) y el email es el de la sesión que venció.
 *
 * Con la verificación en dos pasos activa, después de la contraseña se pide
 * el código de la app (o uno de recuperación) en el mismo diálogo.
 */
interface LoginResult {
  ok: boolean;
  error?: string;
  code?: string;
  twoFactor?: boolean;
}

export function SessionExpiredDialog({
  email,
  onLogin,
  onCode,
  onSwitchAccount,
  onDismiss,
}: {
  email: string;
  onLogin: (password: string, captcha?: string) => Promise<LoginResult>;
  onCode: (code: string) => Promise<LoginResult>;
  onSwitchAccount: () => void;
  onDismiss: () => void;
}) {
  const fid = useId();
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // La contraseña estuvo bien y falta el código del segundo paso.
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await onLogin(password, captcha || undefined);
    setBusy(false);
    setPassword('');
    if (res.twoFactor) setTwoFactor(true);
    else if (!res.ok) setError(res.error ?? 'No se pudo iniciar sesión.');
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await onCode(code);
    setBusy(false);
    setCode('');
    if (res.ok) return;
    // Se pasaron los minutos de gracia: de nuevo la contraseña.
    if (res.code === 'Auth.TwoFactorExpired') setTwoFactor(false);
    setError(res.error ?? 'El código no es correcto.');
  };

  if (twoFactor) {
    return (
      <Modal open onClose={onDismiss} size="sm" title="Tu sesión venció">
        <form id={`${fid}-form`} onSubmit={submitCode} className="space-y-3">
          <p className="text-sm text-fg-muted">
            Escribí el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de recuperación.
          </p>
          <div>
            <label htmlFor={`${fid}-code`} className="mb-1 block text-sm font-medium text-fg">
              Código
            </label>
            <input
              id={`${fid}-code`}
              autoComplete="one-time-code"
              required
              autoFocus
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fid}-error` : undefined}
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {error && (
            <p id={`${fid}-error`} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onSwitchAccount}
              className="text-sm text-fg-muted underline-offset-2 hover:underline"
            >
              Entrar con otra cuenta
            </button>
            <Button type="submit" loading={busy} disabled={!code.trim()}>
              Verificar
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onDismiss} size="sm" title="Tu sesión venció">
      <form id={`${fid}-form`} onSubmit={submit} className="space-y-3">
        <p className="text-sm text-fg-muted">
          Volvé a ingresar para seguir. Lo que tenías en pantalla no se perdió: después de entrar, repetí lo
          que no se llegó a guardar.
        </p>
        <div>
          <label htmlFor={`${fid}-email`} className="mb-1 block text-sm font-medium text-fg">
            Email
          </label>
          <input
            id={`${fid}-email`}
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            className="h-10 w-full rounded-md border border-border bg-bg-muted px-3 text-sm text-fg-muted"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-password`} className="mb-1 block text-sm font-medium text-fg">
            Contraseña
          </label>
          <input
            id={`${fid}-password`}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fid}-error` : undefined}
            className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <Captcha onToken={setCaptcha} />
        {error && (
          <p id={`${fid}-error`} role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onSwitchAccount}
            className="text-sm text-fg-muted underline-offset-2 hover:underline"
          >
            Entrar con otra cuenta
          </button>
          <Button type="submit" loading={busy} disabled={!password || captcha === null}>
            Ingresar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
