/**
 * Renderizar una página del App Router en un test.
 *
 * Las páginas son Server Components async: arman la tienda en el server y
 * devuelven componentes cliente. jsdom no puede renderizar un componente async,
 * así que acá se hace lo que hace el server de React: se recorre el árbol, se
 * ejecutan las funciones async (son de server: no usan hooks) y lo que queda —
 * HTML y componentes cliente — se renderiza normal.
 */
import { render } from '@testing-library/react';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { nav } from './next';

type Component = (props: unknown) => ReactNode | Promise<ReactNode>;

const isAsync = (fn: unknown): fn is (props: unknown) => Promise<ReactNode> =>
  typeof fn === 'function' && fn.constructor.name === 'AsyncFunction';

const isFunctionComponent = (fn: unknown): fn is Component =>
  typeof fn === 'function' &&
  !(fn as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent;

/**
 * Un componente sync puede ser de server (envuelve a uno async, como
 * LegalPage) o de cliente. Se lo llama "en seco": si usa hooks, React tira
 * (no hay render en curso) y queda para el render de jsdom; si no, devuelve su
 * árbol y se sigue resolviendo.
 */
function tryServer(
  fn: Component,
  props: unknown,
): { ok: true; value: ReactNode | Promise<ReactNode> } | { ok: false } {
  const original = console.error;
  console.error = () => {}; // "Invalid hook call": esperado en un componente cliente
  try {
    return { ok: true, value: fn(props) };
  } catch {
    return { ok: false };
  } finally {
    console.error = original;
  }
}

/** Resuelve los Server Components async de un árbol (incluidos los anidados en props). */
export async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  if (isAsync(element.type)) return resolveServer(await element.type(element.props));
  if (isFunctionComponent(element.type)) {
    const attempt = tryServer(element.type, element.props);
    if (attempt.ok) return resolveServer(await attempt.value);
  }

  const props = element.props;
  const resolvedProps: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || isValidElement(value) || Array.isArray(value)) {
      const resolved = await resolveServer(value as ReactNode);
      if (resolved !== value) {
        resolvedProps[key] = key === 'children' ? Children.toArray(resolved) : resolved;
        changed = true;
      }
    }
  }
  return changed ? cloneElement(element, resolvedProps) : element;
}

type Page<P> = (props: P) => Promise<ReactNode> | ReactNode;

/**
 * Una página del storefront en esa URL, como la sirve Next: host de la tienda
 * sembrada, params y searchParams como promesas.
 */
export async function renderPage<P extends object>(
  page: Page<P>,
  url: string,
  params: Record<string, string> = {},
) {
  nav.at(url);
  const searchParams = Object.fromEntries(new URLSearchParams(nav.search));
  const props = { params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) } as P;
  const tree = await resolveServer(await page(props));
  return render(<>{tree}</>);
}
