import { useQuery } from '@tanstack/react-query';
import { useStore } from '../context/StoreContext';
import { api } from './api';
import { qk } from './queryKeys';

export type AiTask =
  | 'QuestionClassify'
  | 'QuestionDraft'
  | 'DataAssistant'
  | 'CatalogWrite'
  | 'CatalogJudge'
  | 'InvoiceRead'
  | 'ShortText';

interface AiStatus {
  tasks: { task: AiTask; available: boolean; reason: string | null; code: string | null }[];
}

/** Códigos de /ai/status con los que el botón no se muestra (el resto se muestra, deshabilitado). */
const DENIED = 'Ai.Denied';
const NOT_CONFIGURED = 'Ai.TaskNotConfigured';

/**
 * Disponibilidad de una tarea de IA para esta persona en esta tienda.
 *
 * - `visible`: si el botón se dibuja. Se oculta solo si a la persona le falta el
 *   permiso de la función (`Ai.Denied`) o si la tienda no armó la IA todavía
 *   (ninguna tarea tiene modelo). Cualquier otro motivo (IA apagada, falta una
 *   clave…) deja el botón visible.
 * - `available` y `reason`: si se puede usar ya y, si no, el porqué. Un botón
 *   visible y no disponible va deshabilitado con `reason` como tooltip: una
 *   función no deja de andar en silencio.
 */
export function useAiTask(task: AiTask): { visible: boolean; available: boolean; reason: string | null } {
  const { store } = useStore();
  const { data } = useQuery({
    queryKey: qk.aiStatus(store?.id),
    queryFn: () => api.get<AiStatus>('/api/v1/ai/status'),
    enabled: !!store,
    staleTime: 60_000,
  });
  const tasks = data?.tasks ?? [];
  const mine = tasks.find((t) => t.task === task);
  const notSetUp = tasks.every((t) => t.code === NOT_CONFIGURED || t.code === DENIED);
  if (!mine || mine.code === DENIED || notSetUp) {
    return { visible: false, available: false, reason: mine?.reason ?? null };
  }
  return { visible: true, available: mine.available, reason: mine.reason };
}
