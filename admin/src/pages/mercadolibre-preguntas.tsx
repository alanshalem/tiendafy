import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button, EmptyList, Input, Spinner, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useAiEnabled } from '../lib/useAi';
import { fecha } from './mercadolibre-shared';
import { useServerLoad } from '../lib/useServerLoad';
import { useListParams } from '../lib/useListParams';

interface MeliQuestion {
  id: number;
  text: string | null;
  status: string | null;
  itemId: string | null;
  dateCreated: string | null;
  answer: { text: string | null; dateCreated: string | null } | null;
}

// ---- Preguntas ---------------------------------------------------------------

/** `?preguntas=todas`; sin el parámetro, solo las que esperan respuesta. */
const LIST_DEFAULTS = { preguntas: 'sin-responder' };

export function PreguntasTab() {
  const { toast } = useToast();
  // El filtro va en la URL (ver useListParams): recargar o volver con «Atrás»
  // no lo pierde, y se puede mandar el link a "todas".
  const list = useListParams(LIST_DEFAULTS);
  const soloSinResponder = list.values.preguntas !== 'todas';
  const setSoloSinResponder = (only: boolean) => list.set({ preguntas: only ? 'sin-responder' : 'todas' });
  const [questions, setQuestions] = useState<MeliQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const aiEnabled = useAiEnabled();
  const [suggesting, setSuggesting] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  // Al cambiar el filtro se vuelve a pedir; mientras tanto, "cargando".
  const { loading, reload: load } = useServerLoad(
    soloSinResponder ? 'sin-responder' : 'todas',
    () =>
      api.get<{ questions: MeliQuestion[] }>(
        `/api/v1/admin/meli/questions${soloSinResponder ? '?status=UNANSWERED' : ''}`,
      ),
    (r) => setQuestions(r.questions),
    (err) => {
      toast(errMsg(err, 'No se pudieron cargar las preguntas.'), { variant: 'error' });
      setQuestions([]);
    },
  );

  // La IA sugiere, el vendedor decide: llena el input, editable antes de enviar.
  const suggest = async (q: MeliQuestion) => {
    setSuggesting(q.id);
    try {
      const r = await api.post<{ text: string }>('/api/v1/ai/ml-answer', {
        question: q.text,
        itemTitle: q.itemId,
      });
      setAnswers((a) => ({ ...a, [q.id]: r.text }));
    } catch (err) {
      toast(errMsg(err, 'La IA no pudo sugerir una respuesta.'), { variant: 'error' });
    } finally {
      setSuggesting(null);
    }
  };

  const answer = async (q: MeliQuestion) => {
    const text = (answers[q.id] ?? '').trim();
    if (!text) return;
    setSendingId(q.id);
    try {
      await api.post(`/api/v1/admin/meli/questions/${q.id}/answer`, { text });
      toast('Respuesta publicada en Mercado Libre', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo responder.'), { variant: 'error' });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant={soloSinResponder ? 'primary' : 'secondary'}
          onClick={() => setSoloSinResponder(true)}
        >
          Sin responder
        </Button>
        <Button
          variant={!soloSinResponder ? 'primary' : 'secondary'}
          onClick={() => setSoloSinResponder(false)}
        >
          Todas
        </Button>
      </div>

      {questions === null || loading ? (
        <Spinner />
      ) : questions.length === 0 ? (
        <EmptyList>
          {soloSinResponder
            ? '¡Al día! No tenés preguntas sin responder en Mercado Libre.'
            : 'Todavía no recibiste preguntas en Mercado Libre.'}
        </EmptyList>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-fg">{q.text}</p>
                <span className="shrink-0 text-xs text-fg-subtle">{fecha(q.dateCreated)}</span>
              </div>
              {q.answer?.text ? (
                <p className="mt-2 rounded-lg bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
                  <span className="font-medium text-fg">Tu respuesta:</span> {q.answer.text}
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Input
                    aria-label={`Tu respuesta a: ${q.text ?? 'la pregunta'}`}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Escribí tu respuesta…"
                    onKeyDown={(e) => e.key === 'Enter' && answer(q)}
                  />
                  {aiEnabled && (
                    <Button
                      variant="secondary"
                      onClick={() => suggest(q)}
                      disabled={suggesting === q.id}
                      title="Sugerir una respuesta con IA (después la editás)"
                    >
                      {suggesting === q.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={() => answer(q)}
                    disabled={sendingId === q.id || !(answers[q.id] ?? '').trim()}
                  >
                    {sendingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Responder'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
