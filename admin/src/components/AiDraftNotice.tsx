import type { AiDraft } from '../lib/aiDraft';

/**
 * Lo que acompaña al borrador de la IA, debajo del campo: "Respondé a mano" con el motivo si la consulta
 * no se puede contestar con IA, o los avisos para revisar antes de enviar. Todo texto plano.
 */
export function AiDraftNotice({ draft }: { draft: AiDraft | null }) {
  if (!draft) return null;
  if (draft.manual) {
    return (
      <p role="status" className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
        <span className="font-medium">Respondé a mano</span>
        {draft.reason && (
          <>
            {' · '}
            <span>{draft.reason}</span>
          </>
        )}
      </p>
    );
  }
  if (draft.warnings.length === 0) return null;
  return (
    <ul role="status" className="mt-2 space-y-1 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
      {draft.warnings.map((w) => (
        <li key={w.code}>{w.message}</li>
      ))}
    </ul>
  );
}
