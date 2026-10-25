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
  tasks: { task: AiTask; available: boolean; reason: string | null }[];
}

/** Lo que responde el servidor cuando la persona no tiene el permiso de la función. */
const NO_PERMISSION = /^No tenés permiso/;

/**
 * Disponibilidad de una tarea de IA para esta persona en esta tienda.
 *
 * - `visible`: si el botón se dibuja. Se oculta (como una integración sin
 *   configurar) cuando la tienda no tiene ninguna tarea disponible, o cuando
 *   a la persona le falta el permiso de la función.
 * - `available` y `reason`: si se puede usar ya y, si no, el porqué (presupuesto,
 *   falta de clave, tarea apagada…). Un botón visible y no disponible va
 *   deshabilitado con `reason` como tooltip: una función no deja de andar en silencio.
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
  const storeUsesAi = tasks.some((t) => t.available);
  if (!mine || !storeUsesAi || (mine.reason !== null && NO_PERMISSION.test(mine.reason))) {
    return { visible: false, available: false, reason: mine?.reason ?? null };
  }
  return { visible: true, available: mine.available, reason: mine.reason };
}
