import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Input, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { Cargando, Vacio, fecha } from './mercadolibre-shared';

interface MeliQuestion {
  id: number;
  text: string | null;
  status: string | null;
  itemId: string | null;
  dateCreated: string | null;
  answer: { text: string | null; dateCreated: string | null } | null;
}

// ---- Preguntas ---------------------------------------------------------------

export function PreguntasTab() {
  const { toast } = useToast();
  const [soloSinResponder, setSoloSinResponder] = useState(true);
  const [questions, setQuestions] = useState<MeliQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setQuestions(null);
    api
      .get<{ questions: MeliQuestion[] }>(
        `/api/v1/admin/meli/questions${soloSinResponder ? '?status=UNANSWERED' : ''}`,
      )
      .then((r) => setQuestions(r.questions))
      .catch((err) => {
        toast(errMsg(err, 'No se pudieron cargar las preguntas.'), { variant: 'error' });
        setQuestions([]);
      });
  }, [soloSinResponder, toast]);

  useEffect(load, [load]);

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

      {questions === null ? (
        <Cargando />
      ) : questions.length === 0 ? (
        <Vacio
          texto={
            soloSinResponder
              ? '¡Al día! No tenés preguntas sin responder en Mercado Libre.'
              : 'Todavía no recibiste preguntas en Mercado Libre.'
          }
        />
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
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Escribí tu respuesta…"
                    onKeyDown={(e) => e.key === 'Enter' && answer(q)}
                  />
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
