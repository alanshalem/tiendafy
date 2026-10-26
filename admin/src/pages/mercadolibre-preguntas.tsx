import { useId, useState } from 'react';
import { ExternalLink, ImageOff, Sparkles } from 'lucide-react';
import { Button, EmptyList, Spinner, Textarea, cn, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { draftPath, requestDraft, useAiDrafts, type AiDraft } from '../lib/aiDraft';
import { AiDraftNotice } from '../components/AiDraftNotice';
import { fecha, moneyMajor } from './mercadolibre-shared';
import { useServerLoad } from '../lib/useServerLoad';
import { useListParams } from '../lib/useListParams';

/** La publicación de la pregunta, tal como la manda la API (MeliItemSummary). */
interface MeliItemSummary {
  id: string;
  title: string | null;
  thumbnail: string | null;
  price: number;
  currencyId: string | null;
  availableQuantity: number;
  permalink: string | null;
  status: string | null;
}

interface MeliQuestion {
  id: number;
  text: string | null;
  status: string | null;
  itemId: string | null;
  /** Null si ML no devolvió la ficha (o la publicación ya no existe). */
  item?: MeliItemSummary | null;
  dateCreated: string | null;
  answer: { text: string | null; dateCreated: string | null } | null;
}

// ---- Preguntas ---------------------------------------------------------------

/** `?preguntas=todas`; sin el parámetro, solo las que esperan respuesta. */
const LIST_DEFAULTS = { preguntas: 'sin-responder' };

/** Mac usa ⌘ donde Windows y Linux usan Ctrl: el aviso dice la tecla de verdad. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SEND_KEYS = isMac ? '⌘ + Enter' : 'Ctrl + Enter';

export function PreguntasTab() {
  const { toast } = useToast();
  // El filtro va en la URL (ver useListParams): recargar o volver con «Atrás»
  // no lo pierde, y se puede mandar el link a "todas".
  const list = useListParams(LIST_DEFAULTS);
  const soloSinResponder = list.values.preguntas !== 'todas';
  const setSoloSinResponder = (only: boolean) => list.set({ preguntas: only ? 'sin-responder' : 'todas' });
  const [questions, setQuestions] = useState<MeliQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const aiDraft = useAiDrafts();
  // El último borrador pedido por pregunta: sus avisos o el "Respondé a mano".
  const [drafts, setDrafts] = useState<Record<number, AiDraft | null>>({});
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

  // La IA sugiere, el vendedor decide: llena el campo, editable antes de enviar.
  // El servidor lee la pregunta y la publicación: el navegador no manda texto.
  // Si la consulta es para contestar a mano, el campo no se toca.
  const suggest = async (q: MeliQuestion) => {
    setSuggesting(q.id);
    setDrafts((d) => ({ ...d, [q.id]: null }));
    try {
      const r = await requestDraft(draftPath.meliQuestion(q.id));
      setDrafts((d) => ({ ...d, [q.id]: r }));
      if (!r.manual && r.text) setAnswers((a) => ({ ...a, [q.id]: r.text! }));
    } catch (err) {
      toast(errMsg(err, 'La IA no pudo sugerir una respuesta.'), { variant: 'error' });
    } finally {
      setSuggesting(null);
    }
  };

  const answer = async (q: MeliQuestion) => {
    const text = (answers[q.id] ?? '').trim();
    if (!text || sendingId === q.id) return;
    setSendingId(q.id);
    try {
      await api.post(`/api/v1/admin/meli/questions/${q.id}/answer`, { text });
      toast('Respuesta publicada en Mercado Libre', { variant: 'success' });
      setDrafts((d) => ({ ...d, [q.id]: null }));
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
              <ItemHeader item={q.item ?? null} itemId={q.itemId} />
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-fg">{q.text}</p>
                <span className="shrink-0 text-xs text-fg-subtle">{fecha(q.dateCreated)}</span>
              </div>
              {q.answer?.text ? (
                <p className="mt-2 rounded-lg bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
                  <span className="font-medium text-fg">Tu respuesta:</span> {q.answer.text}
                </p>
              ) : (
                <AnswerBox
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={(text) => setAnswers((a) => ({ ...a, [q.id]: text }))}
                  onSend={() => answer(q)}
                  sending={sendingId === q.id}
                  onSuggest={aiDraft.visible ? () => suggest(q) : null}
                  suggestOff={aiDraft.available ? null : aiDraft.reason}
                  suggesting={suggesting === q.id}
                  draft={drafts[q.id] ?? null}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * De qué publicación es la pregunta: foto, título, precio y stock. Sin esto
 * había que abrir Mercado Libre en otra pestaña para saber si "¿tenés en
 * talle L?" hablaba de una remera o de un buzo, o si quedaba stock.
 */
function ItemHeader({ item, itemId }: { item: MeliItemSummary | null; itemId: string | null }) {
  if (!item) {
    return itemId ? <p className="mb-2 font-mono text-xs text-fg-subtle">Publicación {itemId}</p> : null;
  }
  return (
    <div className="mb-3 flex items-center gap-3 border-b border-border pb-3">
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-md border border-border bg-bg-subtle object-contain"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-bg-subtle text-fg-subtle">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{item.title ?? item.id}</p>
        <p className="text-xs text-fg-muted">
          {item.price > 0 && (
            <span className="font-semibold text-fg">{moneyMajor(item.price, item.currencyId ?? 'ARS')}</span>
          )}
          {item.price > 0 && ' · '}
          <span className={cn(item.availableQuantity <= 0 && 'font-medium text-danger')}>
            {item.availableQuantity > 0
              ? `${item.availableQuantity} ${item.availableQuantity === 1 ? 'disponible' : 'disponibles'}`
              : 'Sin stock'}
          </span>
          {item.status &&
            item.status !== 'active' &&
            ` · ${item.status === 'paused' ? 'Pausada' : 'Finalizada'}`}
        </p>
      </div>
      {item.permalink && (
        <a
          href={item.permalink}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ver “${item.title ?? item.id}” en Mercado Libre`}
          className="shrink-0 rounded p-1 text-fg-subtle hover:text-fg"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

/**
 * La respuesta. Es pública y no se puede editar ni borrar en ML: por eso
 * Enter hace un salto de línea y no la publica (antes un Enter de más
 * mandaba una respuesta a medio escribir). Se publica con el botón o con
 * Ctrl/⌘ + Enter, y el atajo está escrito al lado.
 */
function AnswerBox({
  question: q,
  value,
  onChange,
  onSend,
  sending,
  onSuggest,
  suggestOff,
  suggesting,
  draft,
}: {
  question: MeliQuestion;
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  onSuggest: (() => void) | null;
  /** El motivo por el que la IA no está disponible ahora (deshabilita el botón); null si anda. */
  suggestOff: string | null;
  suggesting: boolean;
  /** Lo último que devolvió la IA para esta pregunta: avisos o "Respondé a mano". */
  draft: AiDraft | null;
}) {
  const hintId = useId();
  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <Textarea
          rows={2}
          aria-label={`Tu respuesta a: ${q.text ?? 'la pregunta'}`}
          aria-describedby={hintId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribí tu respuesta…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        {onSuggest && (
          <Button
            variant="secondary"
            onClick={onSuggest}
            disabled={suggesting || suggestOff !== null}
            title={suggestOff ?? 'Sugerir una respuesta con IA (después la editás)'}
          >
            {suggesting ? <Spinner inline /> : <Sparkles className="h-4 w-4" />}
          </Button>
        )}
      </div>
      <AiDraftNotice draft={draft} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-xs text-fg-subtle">
          Se publica en Mercado Libre y no se puede editar. {SEND_KEYS} para publicar.
        </p>
        <Button onClick={onSend} disabled={sending || !value.trim()}>
          {sending ? <Spinner inline /> : 'Publicar respuesta'}
        </Button>
      </div>
    </div>
  );
}
