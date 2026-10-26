import { api } from './api';
import type { InboxThread } from './inbox';
import { useAiTask } from './useAi';

/** Un aviso del servidor sobre el borrador (texto plano, ya redactado para la persona). */
export type DraftWarning = {
  code: 'contact-data' | 'link' | 'amount' | 'too-long' | 'delivery-date';
  message: string;
};

/** Lo que devuelve `POST …/draft`. Con `manual`, no hay texto: se responde a mano por el motivo. */
export type AiDraft = {
  text: string | null;
  category: string;
  reason: string | null;
  manual: boolean;
  warnings: DraftWarning[];
};

/** Las rutas del borrador por canal: el navegador manda solo el id, el servidor lee la consulta. */
export const draftPath = {
  meliQuestion: (id: number) => `/api/v1/ai/ml/questions/${id}/draft`,
  meliPack: (packId: number) => `/api/v1/ai/ml/messages/${packId}/draft`,
  support: (conversationId: string) =>
    `/api/v1/ai/support/conversations/${encodeURIComponent(conversationId)}/draft`,
  contact: (messageId: string) => `/api/v1/ai/contact/${encodeURIComponent(messageId)}/draft`,
};

export function draftPathFor(thread: InboxThread): string {
  switch (thread.channel) {
    case 'ml-pregunta':
      return draftPath.meliQuestion(thread.context.questionId);
    case 'ml-mensaje':
      return draftPath.meliPack(thread.context.packId);
    case 'posventa':
      return draftPath.support(thread.externalId);
    case 'contacto':
      return draftPath.contact(thread.externalId);
  }
}

/** Pide el borrador sin mandar texto. */
export function requestDraft(path: string): Promise<AiDraft> {
  return api.post<AiDraft>(path, undefined);
}

/**
 * Disponibilidad de los borradores: necesitan clasificar y redactar. No se ve si alguna de las dos
 * no se ve; queda deshabilitado con el primer motivo si alguna no está disponible.
 */
export function useAiDrafts(): { visible: boolean; available: boolean; reason: string | null } {
  const classify = useAiTask('QuestionClassify');
  const draft = useAiTask('QuestionDraft');
  const missing = [classify, draft].find((t) => !t.available);
  return {
    visible: classify.visible && draft.visible,
    available: !missing,
    reason: missing ? missing.reason : null,
  };
}
