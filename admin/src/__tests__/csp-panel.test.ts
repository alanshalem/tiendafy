import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La CSP del panel vive en dos lugares: el meta de index.html y el header del
 * nginx del contenedor. Turnstile (el captcha del login, shared/ui/Captcha.tsx)
 * carga su script desde challenges.cloudflare.com y dibuja el widget en un
 * iframe de ese host: si alguna de las dos políticas no lo deja, con el captcha
 * configurado nadie puede entrar al panel.
 */
const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name, values);
  }
  return map;
}

function metaPolicy(): string {
  const match = read('index.html').match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  if (!match) throw new Error('index.html sin meta CSP');
  return match[1];
}

function headerPolicy(): string {
  const match = read('nginx-security-headers.conf').match(/add_header Content-Security-Policy "([^"]+)"/);
  if (!match) throw new Error('nginx-security-headers.conf sin CSP');
  return match[1];
}

const TURNSTILE = 'https://challenges.cloudflare.com';

describe('CSP del panel y Turnstile', () => {
  it.each([
    ['index.html', metaPolicy],
    ['nginx-security-headers.conf', headerPolicy],
  ])('%s permite el script y el iframe de Turnstile', (_file, policy) => {
    const csp = directives(policy());
    expect(csp.get('script-src')).toContain(TURNSTILE);
    expect(csp.get('frame-src')).toContain(TURNSTILE);
  });

  it('la política de runtime (connect-src acotado) también deja pasar a Turnstile', () => {
    // docker-config.sh arma un segundo header con connect-src; con dos políticas
    // el navegador aplica las dos, así que ahí también tiene que estar.
    const script = read('docker-config.sh');
    expect(script).toMatch(/connect-src 'self' https:\/\/challenges\.cloudflare\.com/);
  });
});
