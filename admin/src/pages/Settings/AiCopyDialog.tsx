import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Modal, Spinner, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { invalidateAi } from '../../lib/ai';
import { qk } from '../../lib/queryKeys';
import { useStore } from '../../context/StoreContext';
import { useAiUsage } from './AiUsageCard';

/**
 * Copia la configuración de IA de esta tienda a otras del mismo dueño. Las tiendas candidatas
 * salen del consumo `owned`: es la lista de las que son tuyas (no las que solo administrás),
 * así que el panel no ofrece un destino que el servidor vaya a rechazar.
 */
export function AiCopyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const owned = useAiUsage('owned', open);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [what, setWhat] = useState({ keys: true, models: true, budget: true });
  const [busy, setBusy] = useState(false);

  const others = (owned.data?.stores ?? []).filter((s) => s.tenantId !== store?.id);
  const canCopy = targets.size > 0 && (what.keys || what.models || what.budget);

  const toggle = (id: string) => {
    const next = new Set(targets);
    if (!next.delete(id)) next.add(id);
    setTargets(next);
  };

  const copy = async () => {
    const ok = await confirm({
      title: 'Copiar la configuración de IA',
      message: 'Esto reemplaza la configuración de IA de las tiendas elegidas.',
      confirmLabel: 'Reemplazar',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body = {
        targetTenantIds: [...targets],
        keys: what.keys,
        models: what.models,
        budget: what.budget,
      };
      const res = await api.post<{ copied: string[] }>('/api/v1/ai/config/copy', body);
      await invalidateAi(qc, store?.id);
      // Las otras tiendas cambiaron: sus botones de IA tampoco pueden quedar con lo viejo.
      for (const id of body.targetTenantIds) void qc.invalidateQueries({ queryKey: qk.aiStatus(id) });
      const n = res.copied?.length ?? body.targetTenantIds.length;
      toast(n === 1 ? 'Configuración copiada a 1 tienda' : `Configuración copiada a ${n} tiendas`, {
        variant: 'success',
      });
      setTargets(new Set());
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo copiar la configuración.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Copiar a mis otras tiendas"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void copy()} disabled={!canCopy || busy}>
            {busy && <Spinner inline />} Copiar
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-fg">¿A qué tiendas?</legend>
        {owned.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner inline /> Cargando tus tiendas…
          </p>
        ) : others.length === 0 ? (
          <p className="text-sm text-fg-muted">No tenés otras tiendas propias a las que copiar.</p>
        ) : (
          others.map((s) => (
            <Checkbox
              key={s.tenantId}
              label={s.name}
              checked={targets.has(s.tenantId)}
              onChange={() => toggle(s.tenantId)}
            />
          ))
        )}
      </fieldset>

      <fieldset className="mt-5 space-y-2">
        <legend className="text-sm font-semibold text-fg">¿Qué copiar?</legend>
        <Checkbox
          label="Claves"
          description="Las claves de los proveedores, tal cual."
          checked={what.keys}
          onChange={(e) => setWhat({ ...what, keys: e.target.checked })}
        />
        <Checkbox
          label="Modelos"
          description="El modelo principal y el de respaldo de cada tarea."
          checked={what.models}
          onChange={(e) => setWhat({ ...what, models: e.target.checked })}
        />
        <Checkbox
          label="Presupuesto"
          description="El interruptor, el tope mensual y el aviso."
          checked={what.budget}
          onChange={(e) => setWhat({ ...what, budget: e.target.checked })}
        />
      </fieldset>
    </Modal>
  );
}
