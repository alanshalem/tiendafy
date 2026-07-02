'use client';

import { Captcha as SharedCaptcha } from '@tiendafy/ui';
import { API_URL } from '@/lib/api-client';

/**
 * Cloudflare Turnstile del storefront: envuelve el componente compartido
 * (@tiendafy/ui) inyectándole la base del API. Misma prop `onToken` que antes.
 */
export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  return <SharedCaptcha apiUrl={API_URL} onToken={onToken} />;
}
