import { useEffect, useId, useRef, useState } from 'react';
import { Button, Spinner, Textarea } from '@tiendafy/ui';
import { errMsg } from '../../lib/api';
import {
  ASSISTANT_MAX_QUESTION,
  askStore,
  clipHistory,
  type AssistantResponse,
  type AssistantTurn,
} from '../../lib/assistant';
import { MiniMarkdown } from '../../lib/miniMarkdown';

/** Una vuelta ya contestada, con lo que el asistente consultó y si quedó a medias. */
interface Entry extends AssistantTurn {
  sources: string[];
  limited: boolean;
}

const storageKey = (storeId: string) => `tiendafy:asistente:${storeId}`;

function load(storeId: string): Entry[] {
  try {
    const raw = sessionStorage.getItem(storageKey(storeId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

function save(storeId: string, entries: Entry[]) {
  try {
    sessionStorage.setItem(storageKey(storeId), JSON.stringify(entries));
  } catch {
    // Sin almacenamiento la conversación sigue, solo que no sobrevive a navegar.
  }
}

/**
 * La conversación con el asistente de datos. Se guarda en la pestaña, por tienda: sobrevive a navegar
 * entre pantallas, nunca pasa de una tienda a otra y se borra al cerrar la pestaña.
 */
export function AskStorePanel({ storeId }: { storeId: string }) {
  const [entries, setEntries] = useState<Entry[]>(() => load(storeId));
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [entries, pending]);

  const ask = async () => {
    const text = question.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    try {
      const history = clipHistory(entries.map(({ question: q, answer }) => ({ question: q, answer })));
      const res: AssistantResponse = await askStore(text, history);
      const next = [
        ...entries,
        { question: text, answer: res.answer, sources: res.sources, limited: res.limited },
      ];
      setEntries(next);
      save(storeId, next);
      setQuestion('');
    } catch (e) {
      // Un error no entra al historial: la pregunta queda en el campo para reintentar.
      setError(errMsg(e, 'No se pudo consultar. Probá de nuevo en un rato.'));
    } finally {
      setPending(false);
    }
  };

  const restart = () => {
    setEntries([]);
    setError(null);
    save(storeId, []);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-fg-subtle">
        Las respuestas salen de los datos de tu tienda que tu usuario puede ver. Revisá los números
        importantes en su pantalla.
      </p>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto" aria-live="polite">
        {entries.length === 0 && !pending && (
          <p className="text-sm text-fg-muted">
            Preguntá por tus ventas, tu stock, tus compras o tus clientes. Por ejemplo: «¿Qué productos se me
            están agotando?»
          </p>
        )}
        {entries.map((entry, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[90%] rounded-lg bg-bg-muted px-3 py-2 text-sm text-fg">
              {entry.question}
            </p>
            <div className="text-sm text-fg">
              <MiniMarkdown text={entry.answer} />
              {entry.limited && (
                <p className="mt-1 text-xs text-warning">
                  No llegué a una respuesta completa. Probá con una pregunta más concreta.
                </p>
              )}
              {entry.sources.length > 0 && (
                <p className="mt-1 text-xs text-fg-subtle">Datos de: {entry.sources.join(', ')}</p>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner inline /> Consultando los datos…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Textarea
          rows={3}
          aria-label="Tu pregunta"
          aria-describedby={hintId}
          value={question}
          maxLength={ASSISTANT_MAX_QUESTION}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Escribí tu pregunta…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void ask();
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={hintId} className="text-xs text-fg-subtle">
            {question.length}/{ASSISTANT_MAX_QUESTION}
          </span>
          <div className="flex gap-2">
            {entries.length > 0 && (
              <Button variant="ghost" onClick={restart} disabled={pending}>
                Empezar de nuevo
              </Button>
            )}
            <Button onClick={() => void ask()} disabled={pending || !question.trim()}>
              Preguntar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
