/**
 * La portada según el estado de la tienda (activa, suspendida, eliminada, sin
 * tienda en ese host, en construcción, vista previa del borrador) y lo que le
 * da a los buscadores: metadata SEO del editor y la Organization/WebSite en
 * datos estructurados. También la metadata de una página de contenido.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage, { generateMetadata } from '../app/page';
import ContentPage, { generateMetadata as contentMetadata } from '../app/paginas/[slug]/page';
import PreviewPage from '../app/preview/page';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { renderPage } from '../test/server';
import { nav } from '../test/next';

const tenant = fixture<{ id: string; name: string; status: string }>(`/api/v1/tenants/${fixtureTenantId}`);
const theme = fixture<Record<string, unknown> & { footer: object; comingSoon: object }>('/api/v1/theme');
const contentPage = fixture<{ slug: string; title: string }>('/api/v1/pages/by-slug/x');

let api: MockApi;
const withTenant = (patch: object) => api.on('GET', '/api/v1/tenants/resolve', { ...tenant, ...patch });
const withTheme = (patch: object) => api.on('GET', '/api/v1/theme', { ...theme, ...patch });

beforeEach(() => {
  api = mockApi();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('portada: metadata', () => {
  it('usa el título y la descripción SEO del editor, y la imagen para compartir', async () => {
    withTheme({
      seoTitle: ' Pesas y más ',
      seoDescription: 'Todo para entrenar',
      shareImage: 'https://cdn.example.com/og.jpg',
    });
    const meta = await generateMetadata();
    expect(meta).toMatchObject({
      title: 'Pesas y más',
      description: 'Todo para entrenar',
      alternates: { canonical: 'http://seed.localhost:3000/' },
      openGraph: { images: ['https://cdn.example.com/og.jpg'] },
    });
  });

  it('sin imagen para compartir va el logo (un SVG no: las redes no lo leen)', async () => {
    withTheme({ shareImage: '', logo: 'https://cdn.example.com/logo.png' });
    expect((await generateMetadata()).openGraph).toMatchObject({
      images: ['https://cdn.example.com/logo.png'],
    });
    withTheme({ shareImage: '', logo: 'https://cdn.example.com/logo.svg' });
    expect((await generateMetadata()).openGraph).toMatchObject({ images: [] });
  });

  it('sin SEO cargado, uno con la marca; sin tema, también', async () => {
    withTheme({ seoTitle: '', seoDescription: '' });
    expect((await generateMetadata()).title).toBe(`${tenant.name} — Tienda online`);
    api.on('GET', '/api/v1/theme', {}, 500);
    expect((await generateMetadata()).description).toMatch(/^Comprá online en /);
  });

  it('un host sin tienda', async () => {
    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    expect((await generateMetadata()).title).toBe('Tienda no encontrada');
  });
});

describe('portada: según la tienda', () => {
  it('activa: secciones del tema y Organization con logo y redes', async () => {
    withTheme({
      logo: 'https://cdn.example.com/logo.png',
      footer: { ...theme.footer, instagram: 'https://instagram.com/seed', facebook: '' },
    });
    await renderPage(HomePage, '/');
    const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.innerHTML);
    expect(ld['@graph'][0]).toMatchObject({
      '@type': 'Organization',
      name: tenant.name,
      logo: 'https://cdn.example.com/logo.png',
      sameAs: ['https://instagram.com/seed'],
    });
  });

  it.each([
    ['SUSPENDED', /está temporalmente suspendida/],
    ['CANCELED', 'Esta tienda ya no está disponible'],
  ])('%s', async (status, text) => {
    withTenant({ status });
    await renderPage(HomePage, '/');
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('sin tienda en ese host', async () => {
    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    await renderPage(HomePage, '/');
    expect(screen.getByText('Tienda no encontrada')).toBeInTheDocument();
  });

  it('en construcción muestra la pantalla de espera, salvo en la vista previa', async () => {
    withTheme({ comingSoon: { ...theme.comingSoon, enabled: true, title: 'Abrimos pronto' } });
    await renderPage(HomePage, '/');
    expect(screen.getByText('Abrimos pronto')).toBeInTheDocument();
  });

  it('la vista previa lee el borrador con el token firmado', async () => {
    api.on('GET', '/api/v1/theme/draft', {
      ...theme,
      sections: [{ id: 'x', type: 'institutional', visible: true, data: { title: 'Sólo en el borrador' } }],
    });
    await renderPage(HomePage, '/?preview=1&pt=tok-firmado');
    expect(screen.getByText('Sólo en el borrador')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/theme/draft'))).toBe(true);
  });
});

describe('vista previa: solo con un borrador de verdad', () => {
  const enConstruccion = () =>
    withTheme({ comingSoon: { ...theme.comingSoon, enabled: true, title: 'Abrimos pronto' } });
  const marcasDelEditor = () => document.querySelectorAll('[data-tf-focus^="section:"]');

  it('?preview=1 sin token no saltea "en construcción" ni pide el borrador', async () => {
    enConstruccion();
    await renderPage(HomePage, '/?preview=1');
    expect(screen.getByText('Abrimos pronto')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/theme/draft'))).toBe(false);
  });

  it('con un token que la API rechaza, la visita es la de cualquiera', async () => {
    enConstruccion();
    api.on('GET', '/api/v1/theme/draft', {}, 401);
    await renderPage(HomePage, '/?preview=1&pt=vencido');
    expect(screen.getByText('Abrimos pronto')).toBeInTheDocument();
  });

  it('sin "en construcción", un token inválido muestra la tienda publicada sin los recuadros del editor', async () => {
    api.on('GET', '/api/v1/theme/draft', {}, 401);
    await renderPage(HomePage, '/?preview=1&pt=vencido');
    expect(marcasDelEditor()).toHaveLength(0);
  });

  it('con el borrador, sí: sin pantalla de espera y con los recuadros del editor', async () => {
    enConstruccion();
    api.on('GET', '/api/v1/theme/draft', { ...theme, comingSoon: { ...theme.comingSoon, enabled: true } });
    await renderPage(HomePage, '/?preview=1&pt=tok-firmado');
    expect(screen.queryByText('Abrimos pronto')).toBeNull();
    expect(marcasDelEditor().length).toBeGreaterThan(0);
  });

  it('una página interna con ?preview=1 sin token también respeta "en construcción"', async () => {
    enConstruccion();
    await renderPage(ContentPage, `/paginas/${contentPage.slug}?preview=1`, { slug: contentPage.slug });
    expect(screen.getByText('Abrimos pronto')).toBeInTheDocument();
  });

  it('/preview sin borrador manda a la portada de siempre', async () => {
    await expect(renderPage(PreviewPage, '/preview')).rejects.toThrow('NEXT_REDIRECT /');
    api.on('GET', '/api/v1/theme/draft', {}, 401);
    await expect(renderPage(PreviewPage, '/preview?pt=vencido')).rejects.toThrow('NEXT_REDIRECT /');
  });
});

describe('página de contenido: metadata', () => {
  it('el título, el comienzo del texto como descripción y la URL canónica', async () => {
    const p = (slug: string) => ({ params: Promise.resolve({ slug }) });
    expect(await contentMetadata(p(contentPage.slug))).toEqual({
      title: contentPage.title,
      // El texto de la página sin HTML, no el título repetido.
      description: 'Condiciones de compra, cambios y devoluciones.',
      alternates: { canonical: `http://seed.localhost:3000/paginas/${contentPage.slug}` },
    });
  });

  it('sin página, "no encontrada" (el layout le suma la tienda); sin tienda, nada', async () => {
    const p = (slug: string) => ({ params: Promise.resolve({ slug }) });
    api.on('GET', '/api/v1/pages/by-slug/nada', {}, 404);
    expect(await contentMetadata(p('nada'))).toEqual({ title: 'Página no encontrada' });
    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    expect(await contentMetadata(p(contentPage.slug))).toEqual({});
  });

  it('una página que no existe responde 404 (y así corre la búsqueda de redirecciones)', async () => {
    api.on('GET', '/api/v1/pages/by-slug/nada', {}, 404);
    await expect(renderPage(ContentPage, '/paginas/nada', { slug: 'nada' })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('una página que se movió (redirección del comercio): 308 a la nueva', async () => {
    api.on('GET', '/api/v1/pages/by-slug/vieja', {}, 404);
    api.on('GET', '/api/v1/redirects/resolve', { to: `/paginas/${contentPage.slug}` });
    nav.headers = { 'x-pathname': '/paginas/vieja' };
    await expect(renderPage(ContentPage, '/paginas/vieja', { slug: 'vieja' })).rejects.toThrow(
      `NEXT_REDIRECT /paginas/${contentPage.slug}`,
    );
  });

  it('si la API falla (5xx) no es un 404: es un error', async () => {
    api.on('GET', '/api/v1/pages/by-slug/rota', {}, 503);
    const err = await renderPage(ContentPage, '/paginas/rota', { slug: 'rota' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toBe('NEXT_NOT_FOUND');
  });
});
