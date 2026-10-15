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

/**
 * Reglas que dependen de layout/color reales (jsdom no los tiene).
 * `label-content-name-mismatch` (lo visible tiene que estar en el nombre)
 * mide el texto en un <canvas> desde axe 4.14: en jsdom no puede correr.
 */
const NEEDS_A_BROWSER = [
  'color-contrast',
  'target-size',
  'scrollable-region-focusable',
  'label-content-name-mismatch',
];

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
  return [...found, ...orphanLabels(root), ...placeholderOnly(root)];
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

/** Tipos de <input> que no son un campo para completar (o que no se ven). */
const NOT_A_FIELD = ['hidden', 'file', 'submit', 'button', 'reset', 'image'];

/**
 * Un campo cuyo único nombre es el placeholder: axe lo acepta (lo toma como
 * último recurso), pero el placeholder desaparece apenas se escribe, muchos
 * lectores de pantalla no lo anuncian como nombre y suele ser un ejemplo
 * ("tu@email.com"), no qué va ahí. Por eso pasaban campos sin nombre real.
 * Vale una <label> asociada, aria-label, aria-labelledby o title.
 */
function placeholderOnly(root: Element) {
  const nodes = [...root.querySelectorAll<HTMLElement>('input, select, textarea')]
    .filter((el) => !(el instanceof HTMLInputElement && NOT_A_FIELD.includes(el.type)))
    // Lo que no se ve (un <dialog> cerrado, por ejemplo el del aviso de
    // confirmación que vive montado) no cuenta.
    .filter((el) => !el.closest('[hidden], [aria-hidden="true"], [inert], dialog:not([open])'))
    .filter((el) => {
      if (el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim()) return false;
      if (el.getAttribute('aria-labelledby')) return false;
      const labels = (el as HTMLInputElement).labels;
      return !labels || ![...labels].some((l) => l.textContent?.trim());
    })
    // Sin las clases: con Tailwind se comen los 160 caracteres y no queda cómo
    // encontrar el campo.
    .map((el) => {
      const attrs = [...el.attributes]
        .filter((a) => a.name !== 'class' && a.name !== 'style')
        .map((a) => `${a.name}="${a.value}"`);
      return `<${el.tagName.toLowerCase()} ${attrs.join(' ')}>`.slice(0, 200);
    });
  return nodes.length === 0
    ? []
    : [{ rule: 'campo-sin-nombre', help: 'El campo no tiene etiqueta (el placeholder no alcanza)', nodes }];
}
