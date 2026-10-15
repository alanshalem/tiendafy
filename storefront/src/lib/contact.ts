import { apiUrl, problemMessage, tenantHeaders } from './api-client';

export type ContactSubmit = { ok: true; reference: string | null } | { ok: false; error: string };

/**
 * Envía el formulario público de contacto (también usado por el botón de
 * arrepentimiento con kind: 'repentance'). Mismos mensajes de error que
 * tenían las dos copias.
 */
export async function submitContact(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<ContactSubmit> {
  try {
    const res = await fetch(`${apiUrl()}/api/v1/contact/submit`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, error: await problemMessage(res, 'No se pudo enviar. Probá de nuevo.') };
    }
    const p = (await res.json().catch(() => null)) as { reference?: string } | null;
    return { ok: true, reference: p?.reference ?? null };
  } catch {
    return { ok: false, error: 'No se pudo enviar. Revisá tu conexión.' };
  }
}
