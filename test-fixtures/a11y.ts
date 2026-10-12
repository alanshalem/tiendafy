/**
 * Accesibilidad automática con axe-core, compartida por admin y storefront.
 *
 * Corre las reglas de WCAG 2.x A/AA que tienen sentido sin un navegador real:
 * nombres accesibles (botones, links, campos, imágenes, diálogos), ARIA válido
 * y bien anidado, foco dentro de lo oculto, controles anidados. Quedan afuera
 * las que necesitan layout o color de verdad (contraste, tamaño de los
 * objetivos táctiles): jsdom no los calcula y darían falsos resultados; esas
 * las cubre el e2e con un navegador.
 *
 * Recibe `axe` por parámetro: cada proyecto lo resuelve desde su node_modules.
 */

interface AxeNode {
  html: string;
  target: unknown[];
}
interface AxeResult {
  id: string;
  impact?: string | null;
  help: string;
  nodes: AxeNode[];
  /** Cuando la regla no pudo correr. */
  error?: unknown;
}
interface Axe {
  run(context: Element, options: object): Promise<{ violations: AxeResult[]; incomplete: AxeResult[] }>;
}

/** Reglas que dependen de layout/color reales (jsdom no los tiene). */
const NEEDS_A_BROWSER = ['color-contrast', 'target-size', 'scrollable-region-focusable'];

/** Las violaciones, resumidas para que un fallo se lea en el reporte del test. */
export async function a11yViolations(axe: Axe, root: Element = document.body) {
  const { violations, incomplete } = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: Object.fromEntries(NEEDS_A_BROWSER.map((id) => [id, { enabled: false }])),
    resultTypes: ['violations', 'incomplete'],
  });
  // Una regla que no pudo correr (falta algo en jsdom) no puede pasar en
  // silencio: así fue como los diálogos quedaron sin revisar.
  const broken = incomplete.filter((v) => v.error);
  const found = [...violations, ...broken].map((v) => ({
    rule: v.id,
    help: v.error ? `axe no pudo correr la regla: ${String((v.error as Error).message ?? v.error)}` : v.help,
    nodes: v.nodes.map((n) => n.html.slice(0, 160)),
  }));
  const orphans = orphanLabels(root);
  return orphans.length > 0 ? [...found, orphans[0]!] : found;
}

/**
 * Una `<label>` que no apunta a ningún campo: axe no la marca si el campo
 * tiene `aria-label`, pero hacer clic en la etiqueta no lo enfoca (y en el
 * celular es el blanco grande para tocar). Va con `htmlFor` o envolviendo.
 */
function orphanLabels(root: Element) {
  const nodes = [...root.querySelectorAll('label')]
    .filter((l) => !l.control)
    .map((l) => l.outerHTML.slice(0, 160));
  return nodes.length === 0
    ? []
    : [{ rule: 'label-sin-campo', help: 'La etiqueta no está asociada a ningún campo', nodes }];
}
