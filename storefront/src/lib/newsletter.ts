import { apiUrl, problemMessage, tenantHeaders } from './api-client';

export type NewsletterSource = 'home' | 'footer' | 'coming-soon';

/**
 * Suscribe un email a las novedades de la tienda.
 *
 * `website` es el honeypot: viaja siempre (vacío para una persona) y el backend
 * descarta el envío sin decir por qué cuando viene lleno. `captcha` es el token
 * de Turnstile (vacío si la plataforma no tiene captcha configurado).
 */
export async function subscribeNewsletter(
  tenantId: string,
  email: string,
  source: NewsletterSource,
  website = '',
  captcha = '',
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl()}/api/v1/newsletter`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify({ email: email.trim(), source, website, captcha: captcha || undefined }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Confirma la suscripción con el token del link del mail (doble
 * confirmación). Devuelve null si salió bien, o el motivo para mostrar.
 */
export async function confirmNewsletter(tenantId: string, token: string): Promise<string | null> {
  const fallback = 'No pudimos confirmar tu suscripción. Probá de nuevo.';
  try {
    const res = await fetch(`${apiUrl()}/api/v1/newsletter/confirm`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify({ token }),
    });
    return res.ok ? null : await problemMessage(res, fallback);
  } catch {
    return fallback;
  }
}
