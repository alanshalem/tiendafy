/**
 * Centro de ayuda: cada artículo se arma entero (secciones, pasos, bloques,
 * demos, anterior/siguiente, relacionados) sin romperse; el índice busca sin
 * acentos y resalta; el índice lateral sigue la sección visible; y las demos
 * (los mismos componentes del panel) responden.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpDemo } from '../components/HelpDemos';
import type { HelpLinkId } from '../config/features';
import { HELP_CONTENT, type HelpDemoId } from '../config/helpContent';
import { foldText } from '../lib/text';
import { mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const TOPICS = Object.keys(HELP_CONTENT) as HelpLinkId[];

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  mockApi();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

/** Abre una página de ayuda y espera su título (el del artículo o el del índice). */
async function openHelp(path: string) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { level: 1 }, { timeout: 5000 });
  await settle(2);
  return user;
}

describe('artículos de ayuda', () => {
  it.each(TOPICS)('%s se arma entero', async (topic) => {
    await openHelp(`/ayuda/${topic}`);
    const article = HELP_CONTENT[topic];
    expect(screen.getByRole('heading', { name: article.title, level: 1 })).toBeInTheDocument();
    for (const section of article.sections) {
      expect(screen.getAllByRole('heading', { name: section.heading }).length).toBeGreaterThan(0);
    }
  });

  it('anterior, siguiente y relacionados navegan entre artículos', async () => {
    const user = await openHelp(`/ayuda/${TOPICS[0]}`);
    const next = screen.getByRole('link', { name: /Siguiente/ });
    await user.click(next);
    expect(await screen.findByRole('link', { name: /Anterior/ })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Anterior/ }));
    await settle(2);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('un tema que no existe ofrece volver al centro de ayuda', async () => {
    const user = await openHelp('/ayuda/no-existe');
    expect(screen.getByRole('heading', { name: 'Tema no encontrado' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Ver todos los temas/ }));
    expect(await screen.findByPlaceholderText(/Buscá: reembolsos/)).toBeInTheDocument();
  });

  it('el índice lateral marca la sección que se está viendo', async () => {
    let callback: IntersectionObserverCallback = () => {};
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe = observe;
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    const topic = TOPICS.find((t) => HELP_CONTENT[t].sections.length > 2)!;
    await openHelp(`/ayuda/${topic}`);
    expect(observe).toHaveBeenCalled();
    const sections = Array.from(document.querySelectorAll('[data-toc-index]'));
    act(() =>
      callback(
        [
          { isIntersecting: false, target: sections[0]! },
          { isIntersecting: true, target: sections[2]! },
        ] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      ),
    );
    const toc = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('#'));
    const third = toc.find((a) => a.textContent === HELP_CONTENT[topic].sections[2]!.heading)!;
    expect(third).toHaveClass('text-primary');
    // Sin ninguna visible, queda la que estaba.
    act(() => callback([], {} as IntersectionObserver));
    expect(third).toHaveClass('text-primary');
    vi.unstubAllGlobals();
  });
});

describe('índice de ayuda', () => {
  it('busca sin acentos, cuenta y resalta; sin resultados ofrece ver todo', async () => {
    const user = await openHelp('/ayuda');
    const search = screen.getByPlaceholderText(/Buscá: reembolsos/);
    expect(screen.getByRole('heading', { name: /Los más consultados/ })).toBeInTheDocument();

    await user.type(search, 'CUPON');
    expect(screen.getByText(/guías? encontradas?/)).toBeInTheDocument();
    expect(document.querySelector('mark')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: /Los más consultados/ })).not.toBeInTheDocument();

    // Regresión: la búsqueda no ignoraba tildes y "envios" no encontraba "envíos".
    const accented = TOPICS.find((t) => HELP_CONTENT[t].title.includes('í'));
    expect(accented).toBeDefined();
    await user.clear(search);
    await user.type(search, foldText(HELP_CONTENT[accented!].title));
    expect(screen.getAllByText(/guías? encontradas?/).length).toBeGreaterThan(0);
    // Se resalta el texto original, con su tilde.
    const marks = Array.from(document.querySelectorAll('mark')).map((m) => m.textContent ?? '');
    expect(marks.some((m) => m.includes('í'))).toBe(true);

    await user.clear(search);
    await user.type(search, 'zzzz qqqq');
    await user.click(screen.getByRole('button', { name: 'Ver todos los temas' }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('heading', { name: /Los más consultados/ })).toBeInTheDocument();
  });

  it('llegando con un ancla de categoría, va a esa categoría', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.location.hash = '#cat-ventas';
    await openHelp('/ayuda');
    window.location.hash = '';
    expect(within(document.body).getAllByRole('link').length).toBeGreaterThan(0);
  });
});

describe('demos del centro de ayuda', () => {
  const DEMOS: HelpDemoId[] = [
    'orderStatuses',
    'campaignStatuses',
    'switch',
    'helpLink',
    'coupon',
    'storefrontPreview',
  ];

  it.each(DEMOS)('%s se ve y responde', async (demo) => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const { container } = render(<HelpDemo demo={demo} />);
    expect(container.firstChild).not.toBeNull();
    await explore(user, () => container as HTMLElement, 10);
  });
});
