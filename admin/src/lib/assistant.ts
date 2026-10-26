import { api } from './api';

/** Una vuelta de la conversación con el asistente. */
export interface AssistantTurn {
  question: string;
  answer: string;
}

/** Lo que devuelve `POST /ai/assistant`. `sources` son las consultas que hizo; `limited`, que quedó a medias. */
export interface AssistantResponse {
  answer: string;
  sources: string[];
  limited: boolean;
}

// Los mismos topes que el servidor (AssistantHistory y AssistantPrompt): el servidor recorta igual.
export const ASSISTANT_MAX_TURNS = 4;
export const ASSISTANT_MAX_CHARS = 4000;
export const ASSISTANT_MAX_QUESTION = 1000;

const size = (turns: AssistantTurn[]) =>
  turns.reduce((sum, t) => sum + t.question.length + t.answer.length, 0);

/**
 * Las últimas vueltas que entran en el tope: se tiran las más viejas, y si la última sola no entra
 * se corta su respuesta y, si ni así, también su pregunta. Mismas reglas que `AssistantHistory.Clip`
 * del servidor.
 */
export function clipHistory(turns: AssistantTurn[]): AssistantTurn[] {
  const kept = turns.slice(-ASSISTANT_MAX_TURNS);
  while (kept.length > 1 && size(kept) > ASSISTANT_MAX_CHARS) kept.shift();
  const only = kept[0];
  if (kept.length === 1 && only && size(kept) > ASSISTANT_MAX_CHARS) {
    const question = only.question.slice(0, ASSISTANT_MAX_CHARS);
    return [{ question, answer: only.answer.slice(0, ASSISTANT_MAX_CHARS - question.length) }];
  }
  return kept;
}

/** Le pregunta al asistente de datos de la tienda. El servidor decide qué puede ver quien pregunta. */
export function askStore(question: string, history: AssistantTurn[]): Promise<AssistantResponse> {
  return api.post<AssistantResponse>('/api/v1/ai/assistant', {
    question,
    history: clipHistory(history),
  });
}
