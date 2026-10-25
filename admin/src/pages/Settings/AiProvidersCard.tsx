import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Spinner, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { invalidateAi, PROVIDER_LABEL, type AiProviderInfo } from '../../lib/ai';
import { useStore } from '../../context/StoreContext';
import { formatDateTime } from '../../lib/format';
import { SETTINGS_CARD } from '../../lib/styles';

/** Una tarjeta por proveedor: estado, últimos cuatro de la clave, cargar o reemplazar, borrar y probar. */
export function AiProvidersCard({ providers }: { providers: AiProviderInfo[] }) {
  return (
    <section className={SETTINGS_CARD}>
      <h2 className="text-base font-semibold text-fg">Claves de los proveedores</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Cargá la clave de al menos un proveedor para usar la inteligencia artificial. La clave se guarda
        cifrada y nunca se vuelve a mostrar: solo vas a ver cómo termina.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.provider} info={p} />
        ))}
      </div>
    </section>
  );
}

function ProviderCard({ info }: { info: AiProviderInfo }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | 'test' | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const name = PROVIDER_LABEL[info.provider] ?? info.provider;

  const save = async () => {
    setBusy('save');
    try {
      await api.put(`/api/v1/ai/config/providers/${info.provider}`, { apiKey: key.trim() });
      setKey('');
      setTest(null);
      await invalidateAi(qc, store?.id);
      toast(`Clave de ${info.provider} guardada`, { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar la clave.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Borrar la clave',
      message: `Se borra la clave de ${info.provider}. Las tareas que usen sus modelos dejan de funcionar hasta que cargues otra.`,
      confirmLabel: 'Borrar clave',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api.delete(`/api/v1/ai/config/providers/${info.provider}`);
      setTest(null);
      await invalidateAi(qc, store?.id);
      toast(`Clave de ${info.provider} borrada`, { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo borrar la clave.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const probe = async () => {
    setBusy('test');
    try {
      setTest(
        await api.post<{ ok: boolean; message: string }>(
          `/api/v1/ai/config/providers/${info.provider}/test`,
          {},
        ),
      );
      await invalidateAi(qc, store?.id);
    } catch (err) {
      setTest({ ok: false, message: errMsg(err, 'No se pudo probar la conexión.') });
    } finally {
      setBusy(null);
    }
  };

  const shown = test ?? lastResult(info);

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{name}</h3>
        {info.configured ? (
          <Badge variant="success">
            Clave cargada <span className="ml-1 font-mono">…{info.last4}</span>
          </Badge>
        ) : (
          <Badge variant="neutral">Sin clave</Badge>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            compact
            type="password"
            autoComplete="off"
            aria-label={`Clave de ${info.provider}`}
            placeholder={info.configured ? 'Pegá una clave nueva para reemplazarla' : 'Pegá la clave'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          aria-label={`${info.configured ? 'Reemplazar' : 'Guardar'} clave de ${info.provider}`}
          onClick={() => void save()}
          disabled={key.trim() === '' || busy !== null}
        >
          {busy === 'save' && <Spinner inline />} {info.configured ? 'Reemplazar' : 'Guardar'}
        </Button>
      </div>

      {info.configured && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Probar conexión con ${info.provider}`}
            onClick={() => void probe()}
            disabled={busy !== null}
          >
            {busy === 'test' && <Spinner inline />} Probar conexión
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Borrar la clave de ${info.provider}`}
            onClick={() => void remove()}
            disabled={busy !== null}
          >
            Borrar
          </Button>
          {shown && (
            <p role="status" className={`w-full text-xs ${shown.ok ? 'text-success' : 'text-danger'}`}>
              {shown.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Lo que dejó la última prueba guardada, mientras no hagas otra. */
function lastResult(info: AiProviderInfo): { ok: boolean; message: string } | null {
  if (info.lastTestOk === null || !info.lastTestAt) return null;
  const when = formatDateTime(info.lastTestAt);
  return info.lastTestOk
    ? { ok: true, message: `La última prueba funcionó (${when}).` }
    : { ok: false, message: `La última prueba falló (${when}). Revisá la clave.` };
}
