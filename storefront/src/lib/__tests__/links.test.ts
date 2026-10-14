/**
 * Los links que escribe el comercio (@tiendafy/types/links): qué se acepta,
 * cómo se completa y qué se rechaza. Viven en shared y se prueban acá porque
 * el storefront es quien los dibuja.
 */
import { describe, expect, it } from 'vitest';
import {
  categoryLink,
  describeLink,
  isExternalHref,
  normalizeLink,
  pageLink,
  productLink,
  safeHref,
  STORE_PAGES,
  whatsappLink,
} from '@tiendafy/types';

describe('normalizeLink', () => {
  it('vacío o solo espacios: sin link y sin error', () => {
    expect(normalizeLink('')).toEqual({ href: null, kind: 'internal' });
    expect(normalizeLink('   ')).toEqual({ href: null, kind: 'internal' });
    expect(normalizeLink(undefined as unknown as string)).toEqual({ href: null, kind: 'internal' });
  });

  it.each([
    ['/productos/remera-oversize', '/productos/remera-oversize'],
    ['  /productos?category=ropa/remeras ', '/productos?category=ropa/remeras'],
    ['/', '/'],
    ['#preguntas', '#preguntas'],
  ])('ruta de la tienda %j queda igual', (input, href) => {
    expect(normalizeLink(input)).toEqual({ href, kind: 'internal' });
  });

  it.each([
    ['contacto', '/contacto'],
    ['productos/remera', '/productos/remera'],
  ])('una ruta sin la barra inicial (%j) la gana', (input, href) => {
    expect(normalizeLink(input)).toEqual({ href, kind: 'internal' });
  });

  it.each([
    ['www.cking.com.ar', 'https://www.cking.com.ar'],
    ['cking.com.ar/ofertas', 'https://cking.com.ar/ofertas'],
    ['instagram.com/mitienda?hl=es', 'https://instagram.com/mitienda?hl=es'],
    ['//cdn.example.com/a.pdf', 'https://cdn.example.com/a.pdf'],
    ['ñandú.com.ar', 'https://ñandú.com.ar'],
  ])('dominio suelto %j gana https://', (input, href) => {
    expect(normalizeLink(input)).toEqual({ href, kind: 'external' });
  });

  it.each([
    'https://cking.com.ar',
    'http://cking.com.ar/x?y=1#z',
    'HTTPS://Cking.com.ar/Ofertas',
    'http://localhost:3000/productos',
  ])('http(s) completo %j se respeta tal cual', (input) => {
    expect(normalizeLink(input)).toEqual({ href: input, kind: 'external' });
  });

  it('una URL con espacios se guarda escapada', () => {
    expect(normalizeLink('https://x.com/a b').href).toBe('https://x.com/a%20b');
  });

  it.each([
    ['https://wa.me/5491122334455', 'https://wa.me/5491122334455'],
    ['wa.me/5491122334455?text=Hola', 'https://wa.me/5491122334455?text=Hola'],
    ['https://api.whatsapp.com/send?phone=549111', 'https://api.whatsapp.com/send?phone=549111'],
  ])('WhatsApp %j', (input, href) => {
    expect(normalizeLink(input)).toEqual({ href, kind: 'whatsapp' });
  });

  it('mailto y un email suelto', () => {
    expect(normalizeLink('mailto:hola@tienda.com')).toEqual({
      href: 'mailto:hola@tienda.com',
      kind: 'mailto',
    });
    expect(normalizeLink('MAILTO:hola@tienda.com?subject=Hola')).toEqual({
      href: 'MAILTO:hola@tienda.com?subject=Hola',
      kind: 'mailto',
    });
    expect(normalizeLink('hola@tienda.com')).toEqual({ href: 'mailto:hola@tienda.com', kind: 'mailto' });
    expect(normalizeLink('mailto:no-es-email')).toMatchObject({ href: null, kind: 'mailto' });
    expect(normalizeLink('mailto:no-es-email').error).toMatch(/email/);
  });

  it('tel: se limpia de espacios y guiones', () => {
    expect(normalizeLink('tel:+54 11 4555-1234')).toEqual({ href: 'tel:+541145551234', kind: 'tel' });
    expect(normalizeLink('tel:(011) 4555 1234')).toEqual({ href: 'tel:01145551234', kind: 'tel' });
    expect(normalizeLink('tel:abc')).toMatchObject({ href: null, kind: 'tel' });
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://x.com',
    'blob:https://x.com/123',
    'whatsapp://send?phone=1',
  ])('rechaza el esquema peligroso o desconocido %j', (input) => {
    const out = normalizeLink(input);
    expect(out.href).toBeNull();
    expect(out.error).toMatch(/no está permitido/);
  });

  it.each([
    ['#', /Falta a dónde/],
    ['# algo', /Falta a dónde/],
    ['/pro ductos', /espacios/],
    ['hola mundo', /No parece un link/],
    ['/\\otro.com', /No parece un link/],
    ['\\\\otro.com', /No parece un link/],
    ['https://', /incompleta/],
    ['https://sin-punto', /incompleta/],
    ['//', /No parece un link/],
    ['javascript&colon;alert(1)', /No parece un link/],
    ['localhost:3000', /No parece un link/],
  ])('rechaza %j con un mensaje en castellano', (input, msg) => {
    const out = normalizeLink(input);
    expect(out.href).toBeNull();
    expect(out.error).toMatch(msg);
  });

  it('nunca devuelve "#" ni un href vacío', () => {
    for (const input of ['#', ' # ', '', '/', 'x']) {
      const { href } = normalizeLink(input);
      expect(href === null || (href !== '#' && href.length > 0)).toBe(true);
    }
  });
});

describe('safeHref', () => {
  it('lo válido normalizado; lo inválido, vacío o no-string → undefined', () => {
    expect(safeHref('www.x.com')).toBe('https://www.x.com');
    expect(safeHref('/productos')).toBe('/productos');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('#')).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(42)).toBeUndefined();
  });
});

describe('destinos de la tienda', () => {
  it('arma los links de producto, página, categoría y WhatsApp', () => {
    expect(productLink('remera oversize')).toBe('/productos/remera%20oversize');
    expect(pageLink('como-comprar')).toBe('/paginas/como-comprar');
    expect(categoryLink('ropa/remeras')).toBe('/productos?category=ropa/remeras');
    expect(whatsappLink('+54 9 11 2233-4455', ' Hola, ¿tienen stock? ')).toBe(
      'https://wa.me/5491122334455?text=Hola%2C%20%C2%BFtienen%20stock%3F',
    );
    expect(whatsappLink('5491122334455')).toBe('https://wa.me/5491122334455');
    expect(whatsappLink('123')).toBeNull();
    expect(whatsappLink('1234567890123456')).toBeNull();
  });

  it('isExternalHref', () => {
    expect(isExternalHref('https://x.com')).toBe(true);
    expect(isExternalHref('/productos')).toBe(false);
    expect(isExternalHref('mailto:a@b.com')).toBe(false);
  });

  it('las páginas fijas incluyen las legales', () => {
    expect(STORE_PAGES.map((p) => p.href)).toEqual(
      expect.arrayContaining(['/terminos', '/privacidad', '/arrepentimiento', '/favoritos']),
    );
  });
});

describe('describeLink', () => {
  it.each([
    ['', { type: 'none' }],
    ['javascript:alert(1)', { type: 'none' }],
    ['/', { type: 'store-page', href: '/', label: 'Inicio' }],
    ['/contacto/', { type: 'store-page', href: '/contacto', label: 'Contacto' }],
    ['/productos/remera-oversize', { type: 'product', slug: 'remera-oversize' }],
    ['/productos/remera%20x', { type: 'product', slug: 'remera x' }],
    ['/productos?category=ropa/remeras', { type: 'category', param: 'ropa/remeras' }],
    ['/paginas/como-comprar', { type: 'page', slug: 'como-comprar' }],
    ['/productos?q=pesas', { type: 'internal', href: '/productos?q=pesas' }],
    ['/otra/cosa', { type: 'internal', href: '/otra/cosa' }],
    [
      'https://wa.me/5491122334455?text=Hola%20che',
      { type: 'whatsapp', phone: '5491122334455', message: 'Hola che' },
    ],
    [
      'https://api.whatsapp.com/send?phone=5491122334455',
      { type: 'whatsapp', phone: '5491122334455', message: '' },
    ],
    ['mailto:hola@x.com?subject=a', { type: 'mailto', address: 'hola@x.com' }],
    ['tel:+5411', { type: 'tel', number: '+5411' }],
    ['x.com', { type: 'external', href: 'https://x.com' }],
  ])('%j', (input, target) => {
    expect(describeLink(input)).toEqual(target);
  });
});
