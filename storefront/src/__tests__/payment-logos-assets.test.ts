// Los logos de medios de pago se bajan en cada página de la tienda (pie y
// ficha de producto) y en el editor del panel. Los SVG originales de Canva
// traían un PNG de 4800 px embebido y sumaban 16 MB: este test es la red para
// que no vuelva a entrar un archivo así.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAYMENT_LOGOS, paymentLogoSrc } from '@tiendafy/types';

const MAX_BYTES = 30 * 1024;
const root = path.resolve(__dirname, '../../..');
const dirs = ['storefront/public/payment-logos', 'admin/public/payment-logos'];

describe.each(dirs)('%s', (dir) => {
  const abs = path.join(root, dir);
  const files = fs.readdirSync(abs);

  it.each(files)('%s pesa menos de 30 KB', (file) => {
    expect(fs.statSync(path.join(abs, file)).size).toBeLessThanOrEqual(MAX_BYTES);
  });

  it('tiene un archivo por cada logo del catálogo, y ninguno de más', () => {
    const expected = PAYMENT_LOGOS.map((l) => path.basename(paymentLogoSrc(l.slug))).sort();
    expect([...files].sort()).toEqual(expected);
  });
});
