import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/**
 * Gating de las sugerencias con IA: sin API key en el servidor, `enabled` es
 * false y los botones "✨ Sugerir" no se muestran (mismo criterio que el
 * resto de las integraciones).
 */
export function useAiEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ enabled: boolean }>('/api/v1/ai/status'),
    staleTime: Infinity,
  });
  return data?.enabled ?? false;
}
