import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { Badge, Button, Card, FormField, Input, Modal, PageHeader, useToast } from '@tiendafy/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiRequestError } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { HelpLink } from '../components/HelpLink';
import {
  problem,
  RecoveryCodesView,
  SetupView,
  type RecoveryCodes,
  type TwoFactorSetup,
} from '../components/TwoFactorSetup';

interface TwoFactorStatus {
  enabled: boolean;
  /** Null mientras no se sabe (se muestra sin la cuenta). */
  recoveryCodesLeft: number | null;
}

/** Para confirmar que es la persona: su contraseña o un código. */
type Confirmation = { password: string } | { code: string };

/** Pasar a otra app: la clave nueva y el ticket con el que se confirma. */
interface RelinkStart extends TwoFactorSetup {
  ticket: string;
}

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
  const [relink, setRelink] = useState<RelinkStart | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState<'disable' | 'regenerate' | 'relink' | null>(null);
  // Dueños y administradores: obligatoria, no se puede desactivar.
  const required = !!user?.twoFactorMandatory;

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
          confirm={(code, password) => api.post<RecoveryCodes>('/api/v1/auth/2fa/enable', { code, password })}
          onCancel={() => setSetup(null)}
          onConfirmed={(r) => {
            setSetup(null);
            refresh(true);
            showCodes(r);
            toast('Listo: la verificación en dos pasos quedó activa.', { variant: 'success' });
          }}
        />
      ) : relink ? (
        <SetupView
          setup={relink}
          // La contraseña y un código ya se pidieron para empezar.
          askPassword={false}
          confirm={(code) =>
            api.post<void>('/api/v1/auth/2fa/relink/confirm', { ticket: relink.ticket, code })
          }
          confirmLabel="Confirmar"
          onCancel={() => setRelink(null)}
          onConfirmed={() => {
            setRelink(null);
            refresh(true);
            toast('Listo: la verificación quedó en la app nueva. La anterior ya no sirve.', {
              variant: 'success',
            });
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
          {required && (
            <p className="text-sm text-fg-muted">
              Para dueños y administradores es obligatoria: no se puede desactivar. Si cambiás de teléfono,
              pasala a la app nueva.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirming('regenerate')}>
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Generar códigos nuevos
            </Button>
            <Button variant="secondary" onClick={() => setConfirming('relink')}>
              <Smartphone className="h-4 w-4" aria-hidden="true" /> Pasar a otra app
            </Button>
            {!required && (
              <Button variant="danger" onClick={() => setConfirming('disable')}>
                Desactivar
              </Button>
            )}
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

      {confirming === 'relink' && (
        <RelinkModal
          onClose={() => setConfirming(null)}
          onStarted={(r) => {
            setConfirming(null);
            setRelink(r);
          }}
        />
      )}
      {(confirming === 'disable' || confirming === 'regenerate') && (
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

/**
 * Pasarla a otra app (teléfono nuevo) pide la contraseña Y un código: de la
 * app de antes o, si ya no la tenés, uno de recuperación. Hasta confirmar con
 * un código de la app nueva, sigue valiendo la de antes.
 */
function RelinkModal({ onClose, onStarted }: { onClose: () => void; onStarted: (r: RelinkStart) => void }) {
  const fid = useId();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const start = useMutation({
    mutationFn: () => api.post<RelinkStart>('/api/v1/auth/2fa/relink', { password, code }),
    onSuccess: onStarted,
    meta: { errorShown: true },
  });
  const error = start.isError ? problem(start.error, 'No se pudo confirmar.') : undefined;
  const errorCode = start.error instanceof ApiRequestError ? start.error.error.code : null;
  const passwordError = errorCode === 'Auth.InvalidPassword';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    start.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Pasar a otra app"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={`${fid}-form`}
            loading={start.isPending}
            disabled={!password || !code.trim()}
          >
            Seguir
          </Button>
        </div>
      }
    >
      <form id={`${fid}-form`} onSubmit={submit} className="space-y-3">
        <p className="text-sm text-fg-muted">
          Para confirmar que sos vos, tu contraseña y un código de la app que usás ahora. ¿Ya no la tenés? Usá
          uno de tus códigos de recuperación.
        </p>
        <FormField label="Tu contraseña" error={passwordError ? error : undefined}>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Código de la app o de recuperación" error={passwordError ? undefined : error}>
          <Input
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </FormField>
      </form>
    </Modal>
  );
}
