import { Captcha as SharedCaptcha } from '@tiendafy/ui';

/** Cloudflare Turnstile, gated por config del backend. Igual que en el storefront. */
export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  return <SharedCaptcha apiUrl={import.meta.env.VITE_API_URL ?? 'http://localhost:5080'} onToken={onToken} />;
}
