import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Modal } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { useAiTask } from '../../lib/useAi';
import { HelpLink } from '../HelpLink';
import { AskStorePanel } from './AskStorePanel';

/**
 * "Preguntale a tu tienda": abre el asistente de datos. Solo existe para quien puede ver estadísticas y
 * cuando la tienda armó la IA; si la tarea no está disponible, queda deshabilitado con el motivo.
 */
export function AskStoreButton() {
  const { store } = useStore();
  const { can } = usePermissions();
  const task = useAiTask('DataAssistant');
  const [open, setOpen] = useState(false);

  if (!store || !can('stats.read') || !task.visible) return null;

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={!task.available}
        title={task.available ? undefined : (task.reason ?? undefined)}
      >
        <Sparkles className="h-4 w-4" aria-hidden /> Preguntale a tu tienda
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Preguntale a tu tienda" placement="right">
        {/* key: al cambiar de tienda la conversación empieza de cero y se lee la suya. */}
        <AskStorePanel key={store.id} storeId={store.id} />
        <HelpLink id="asistente" className="mt-3" />
      </Modal>
    </>
  );
}
