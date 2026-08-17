import { Captcha as SharedCaptcha } from '@tiendafy/ui';
import { API_URL } from '../lib/api';

/** Cloudflare Turnstile, gated por config del backend. Igual que en el storefront. */
export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  return <SharedCaptcha apiUrl={API_URL} onToken={onToken} />;
}
