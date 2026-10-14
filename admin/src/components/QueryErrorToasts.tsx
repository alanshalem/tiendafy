import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@tiendafy/ui';
import { loadFailureMessage, mutationFailureMessage } from '../lib/queryClient';

/** Una caída de la API hace fallar diez pedidos a la vez: un solo aviso por tanda. */
const QUIET_MS = 8000;

/** Avisa las cargas y los guardados que fallaron y la pantalla no muestra (ver lib/queryClient). */
export function QueryErrorToasts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    let last = 0;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const message = loadFailureMessage(event.query, event.action.error);
      if (!message || Date.now() - last < QUIET_MS) return;
      last = Date.now();
      toast(message, { variant: 'error', durationMs: 8000 });
    });
  }, [queryClient, toast]);

  // Lo que se guarda no se agrupa: cada falla es algo que el comercio hizo y
  // tiene que saber que no quedó.
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const message = mutationFailureMessage(event.mutation, event.action.error);
        if (message) toast(message, { variant: 'error', durationMs: 8000 });
      }),
    [queryClient, toast],
  );

  return null;
}
