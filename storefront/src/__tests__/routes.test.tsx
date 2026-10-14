/**
 * Lo que la tienda sirve fuera de las páginas: sitemap y robots por host, el
 * proxy que deja la ruta pedida para el 404, el 404 (con las redirecciones que
 * cargó el comercio), la pantalla de error, el layout raíz, la de "en
 * construcción" y el newsletter.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as sitemap } from '../app/sitemap.xml/route';
import robots from '../app/robots';
import NotFound, { generateMetadata as notFoundMetadata } from '../app/not-found';
import Unmatched from '../app/[...ruta]/page';
import ErrorPage from '../app/error';
import RootLayout, { generateMetadata as layoutMetadata } from '../app/layout';
import { proxy } from '../proxy';
import { ComingSoon } from '../components/store/ComingSoon';
import { NewsletterForm } from '../components/store/NewsletterForm';
import { defaultTheme, mergeTheme } from '../lib/theme';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';

// Las fuentes del editor (app/store-fonts.ts): next/font las procesa al
// compilar; en el test alcanza con la clase de la variable de cada una.
vi.mock('next/font/local', () => ({
  default: (options: { variable: string }) => ({ variable: options.variable.slice(2) }),
}));

const slug = fixture<{ slug: string }>('/api/v1/products/by-slug/x').slug;
const pageSlug = fixture<{ items: { slug: string }[] }>('/api/v1/pages/published').items[0]?.slug;

let api: MockApi;
let crashes: () => unknown[][];
beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('sitemap y robots', () => {
  it('el sitemap lista las fijas, cada producto activo y cada página publicada, con URL absoluta', async () => {
    nav.headers = { 'x-forwarded-proto': 'https' };
    const res = await sitemap();
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const xml = await res.text();
    expect(xml).toContain('<loc>https://seed.localhost:3000/</loc>');
    expect(xml).toContain('<loc>https://seed.localhost:3000/contacto</loc>');
    expect(xml).toContain(`<loc>https://seed.localhost:3000/productos/${slug}</loc>`);
    if (pageSlug) expect(xml).toContain(`/paginas/${pageSlug}</loc>`);
  });

  it('lista cada categoría con la URL de su listado (la ruta, legible)', async () => {
    api.on('GET', '/api/v1/categories', {
      items: [
        { id: 'c1', name: 'Ropa', parentId: null, path: 'ropa', depth: 1 },
        { id: 'c2', name: 'Remeras & musculosas', parentId: 'c1', path: 'ropa/remeras&musculosas', depth: 2 },
      ],
    });
    const xml = await (await sitemap()).text();
    expect(xml).toContain('<loc>http://seed.localhost:3000/productos?category=ropa</loc>');
    // El & va codificado en la URL: suelto, rompería el XML del sitemap entero.
    expect(xml).toContain(
      '<loc>http://seed.localhost:3000/productos?category=ropa/remeras%26musculosas</loc>',
    );
  });

  it('sin tienda para el host, solo las fijas; sin proto, http en localhost', async () => {
    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    const xml = await (await sitemap()).text();
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain('http://seed.localhost:3000/');
  });

  it('si las páginas publicadas fallan, el sitemap sale igual', async () => {
    api.on('GET', '/api/v1/pages/published', {}, 500);
    const xml = await (await sitemap()).text();
    expect(xml).toContain(`/productos/${slug}</loc>`);
  });

  it('en construcción solo lista la portada (el catálogo no se muestra)', async () => {
    const theme = fixture<{ comingSoon: object }>('/api/v1/theme');
    api.on('GET', '/api/v1/theme', { ...theme, comingSoon: { ...theme.comingSoon, enabled: true } });
    const xml = await (await sitemap()).text();
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).toContain('<loc>http://seed.localhost:3000/</loc>');
  });

  it('robots apunta al sitemap absoluto y no bloquea nada (lo privado va con noindex)', async () => {
    expect(await robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'http://seed.localhost:3000/sitemap.xml',
    });
    nav.at('/', 'tienda.example.com');
    expect((await robots()).sitemap).toBe('https://tienda.example.com/sitemap.xml');
  });
});

describe('404 y errores', () => {
  it('el proxy deja la ruta pedida en x-pathname', () => {
    const res = proxy(new NextRequest('http://seed.localhost:3000/viejo/link?x=1'));
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/viejo/link');
  });

  it('una URL que no es de ninguna página: si el comercio cargó una redirección, redirige', async () => {
    nav.headers = { 'x-pathname': '/viejo' };
    api.on('GET', '/api/v1/redirects/resolve', { to: '/productos' });
    await expect(Unmatched()).rejects.toThrow('NEXT_REDIRECT /productos');
    expect(api.calls.some((c) => c.path === '/api/v1/redirects/resolve?path=%2Fviejo')).toBe(true);
  });

  it.each([
    ['sin x-pathname', () => undefined],
    ['sin redirección', () => api.on('GET', '/api/v1/redirects/resolve', {}, 404)],
    ['redirección vacía', () => api.on('GET', '/api/v1/redirects/resolve', {})],
    ['sin tienda', () => api.on('GET', '/api/v1/tenants/resolve', {}, 404)],
    ['la API caída', () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))],
  ])('si no, es un 404 (%s)', async (name, arrange) => {
    if (name !== 'sin x-pathname') nav.headers = { 'x-pathname': '/no-existe' };
    arrange();
    await expect(Unmatched()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('la pantalla de 404 solo pinta: Next la arma en cada página, no puede consultar la API', async () => {
    nav.headers = { 'x-pathname': '/contacto' };
    render(NotFound());
    expect(screen.getByText('Esta página no existe')).toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it('la pantalla de error ofrece reintentar', async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('x')} reset={reset} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reset).toHaveBeenCalled();
  });

  it('el 404 se titula con la tienda', async () => {
    const tenant = fixture<{ name: string }>(`/api/v1/tenants/${fixtureTenantId}`);
    expect((await notFoundMetadata()).title).toEqual({ absolute: `Página no encontrada · ${tenant.name}` });
    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    expect((await notFoundMetadata()).title).toEqual({ absolute: 'Página no encontrada' });
  });

  it('el layout raíz pone la plantilla del título con la tienda y su favicon', async () => {
    const tenant = fixture<{ name: string }>(`/api/v1/tenants/${fixtureTenantId}`);
    const theme = fixture<Record<string, unknown>>('/api/v1/theme');
    api.on('GET', '/api/v1/theme', {
      ...theme,
      favicon: 'https://cdn.example.com/fav.png',
      seoDescription: '',
    });
    expect(await layoutMetadata()).toEqual({
      title: { template: `%s · ${tenant.name}`, default: tenant.name },
      description: `Comprá online en ${tenant.name}.`,
      icons: { icon: 'https://cdn.example.com/fav.png' },
    });

    // Sin favicon propio, el de Tiendafy (en public/, no app/: ver layout).
    api.on('GET', '/api/v1/theme', { ...theme, favicon: '' });
    expect((await layoutMetadata()).icons).toEqual({ icon: '/icon.svg' });

    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    expect((await layoutMetadata()).title).toBe('Tienda online');
  });

  it('el layout raíz publica la config de runtime antes que los bundles', () => {
    const html = RootLayout({ children: <p>hola</p> }) as ReactElement<{
      lang: string;
      children: ReactElement[];
    }>;
    expect(html.props.lang).toBe('es');
    const head = html.props.children[0] as ReactElement<{ children: ReactElement | ReactElement[] }>;
    const first = [head.props.children].flat()[0] as ReactElement<{
      id: string;
      dangerouslySetInnerHTML: { __html: string };
    }>;
    expect(first.props.id).toBe('tiendafy-runtime-config');
    expect(first.props.dangerouslySetInnerHTML.__html).toMatch(/^window\.__TIENDAFY_CONFIG__=\{/);
  });
});

describe('en construcción', () => {
  const theme = (comingSoon: object, extra: object = {}) =>
    mergeTheme({ ...defaultTheme, ...extra, comingSoon: { ...defaultTheme.comingSoon, ...comingSoon } });

  it('centrada, con la etiqueta, la fecha de apertura, WhatsApp, redes y el newsletter', async () => {
    const t = theme(
      { collectEmails: true, launchDate: '2026-11-15', whatsapp: '+54 9 11 5555-4444' },
      { footer: { ...defaultTheme.footer, instagram: 'https://instagram.com/tienda' } },
    );
    render(<ComingSoon theme={t} tenantName="Mi Tienda" tenantId={fixtureTenantId} />);
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
    expect(screen.getByText(/15 de noviembre/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WhatsApp/i })).toHaveAttribute(
      'href',
      'https://wa.me/5491155554444',
    );
    expect(screen.getByRole('link', { name: /Instagram/ })).toBeInTheDocument();
    expect(screen.getByText('Dejanos tu email y te avisamos cuando abramos.')).toBeInTheDocument();
  });

  it('dividida con imagen, esquinas rectas, logo y sin datos opcionales', () => {
    const t = theme(
      {
        layout: 'split',
        image: 'https://cdn.example.com/obra.jpg',
        eyebrow: '',
        message: '',
        launchDate: '2026-13-01',
        showSocial: false,
      },
      { borderRadius: 'sharp', logo: 'https://cdn.example.com/logo.png' },
    );
    const { container } = render(<ComingSoon theme={t} tenantName="Mi Tienda" tenantId={fixtureTenantId} />);
    expect(container.querySelector('main')).toHaveClass('grid');
    expect(container.querySelector('[role=presentation]')).toHaveStyle({
      backgroundImage: 'url(https://cdn.example.com/obra.jpg)',
    });
    expect(screen.queryByText('Próximamente')).not.toBeInTheDocument();
    expect(screen.queryByText(/Abrimos/)).not.toBeInTheDocument(); // fecha inválida: no se muestra
  });

  it('centrada con imagen de fondo', () => {
    const t = theme({ image: 'https://cdn.example.com/fondo.jpg' });
    const { container } = render(<ComingSoon theme={t} tenantName="Mi Tienda" tenantId={fixtureTenantId} />);
    expect(container.querySelector('main')).not.toHaveClass('grid');
    expect(container.innerHTML).toContain('cdn.example.com/fondo.jpg');
  });
});

describe('newsletter', () => {
  async function subscribe(email = 'ana@example.com') {
    const user = userEvent.setup({ delay: null });
    render(<NewsletterForm source="footer" compact tenantId={fixtureTenantId} />);
    await user.type(screen.getByLabelText('Email'), email);
    await user.click(screen.getByRole('button'));
    await settle(1);
  }

  it('suscribe con el origen y el honeypot vacío', async () => {
    await subscribe('  ana@example.com ');
    expect(api.calls.find((c) => c.path === '/api/v1/newsletter')?.body).toEqual({
      email: 'ana@example.com',
      source: 'footer',
      website: '',
    });
    expect(screen.getByText(/Te vamos a escribir cuando haya novedades/)).toBeInTheDocument();
  });

  it('si la API rechaza o no hay red, lo dice', async () => {
    api.on('POST', '/api/v1/newsletter', {}, 429);
    await subscribe();
    expect(screen.queryByText(/Te vamos a escribir/)).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
