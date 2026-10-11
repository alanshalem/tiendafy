/**
 * Prueba exploratoria ("monkey testing") compartida por admin y storefront:
 * dejar correr las queries, completar formularios, apretar botones (y
 * explorar los diálogos que abren) y detectar si algo reventó.
 *
 * Es una fábrica: cada proyecto le pasa SU Testing Library y SU `vi`. Así este
 * archivo no importa nada (las dependencias viven en el node_modules de cada
 * proyecto, no en la raíz del workspace) y no hay una copia por proyecto.
 */

/** Lo mínimo de Testing Library que se usa (estructural, sin importar tipos). */
interface Queries {
  queryAllByRole(role: string): HTMLElement[];
}
interface TestingLibrary {
  act(fn: () => Promise<void>): Promise<void>;
  screen: Queries;
  within(el: HTMLElement): Queries;
}
interface Spy {
  mockImplementation(fn: (...args: unknown[]) => void): unknown;
}
interface Vi {
  spyOn(obj: Console, method: 'error'): Spy;
}
export interface User {
  click(el: Element): Promise<void>;
  type(el: Element, text: string): Promise<void>;
  selectOptions(el: Element, value: HTMLOptionElement): Promise<void>;
  keyboard(text: string): Promise<void>;
}

/** Lo que no se aprieta: salir de la sesión dejaría el resto sin probar. */
export const SKIP = /cerrar sesi[oó]n|salir/i;

const usable = (el: HTMLElement) =>
  el.isConnected && !el.hasAttribute('disabled') && !el.hasAttribute('readonly');

export function createExplorer({ act, screen, within }: TestingLibrary, vi: Vi) {
  /** Deja correr las queries y efectos (varias rondas: unas disparan otras). */
  async function settle(rounds = 3) {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
    }
  }

  /** Completa un formulario como lo haría alguien: campos, selects y casillas. */
  async function fill(user: User, root: HTMLElement) {
    const scope = within(root);
    for (const field of scope.queryAllByRole('textbox').slice(0, 20)) {
      if (usable(field)) await user.type(field, '12');
    }
    for (const field of scope.queryAllByRole('spinbutton').slice(0, 10)) {
      if (usable(field)) await user.type(field, '3');
    }
    for (const select of scope.queryAllByRole('combobox').slice(0, 10)) {
      if (!usable(select) || select.tagName !== 'SELECT') continue;
      const options = Array.from((select as HTMLSelectElement).options).filter((o) => !o.disabled);
      if (options.length > 1) await user.selectOptions(select, options[options.length - 1]!);
    }
    for (const box of scope.queryAllByRole('checkbox').slice(0, 10)) {
      if (usable(box)) await user.click(box);
    }
    await settle(1);
  }

  /**
   * Aprieta un botón; si abre un diálogo, lo completa y aprieta sus botones
   * (guardar, confirmar…) antes de cerrarlo con Escape.
   */
  async function press(user: User, button: HTMLElement) {
    const before = screen.queryAllByRole('dialog').length;
    await user.click(button);
    await settle(2);
    const dialogs = screen.queryAllByRole('dialog');
    if (dialogs.length > before) {
      const dialog = dialogs[dialogs.length - 1]!;
      await fill(user, dialog);
      for (const inner of within(dialog).queryAllByRole('button').slice(0, 8)) {
        if (!usable(inner) || SKIP.test(inner.textContent ?? '')) continue;
        await user.click(inner);
        await settle(2);
      }
    }
    await user.keyboard('{Escape}');
    await settle(1);
  }

  /**
   * Aprieta los botones de `root` (cada etiqueta hasta 3 veces: los de solo
   * ícono de una tabla comparten etiqueta y tres filas alcanzan) y después
   * completa sus campos.
   */
  async function explore(user: User, root: () => HTMLElement, maxClicks: number) {
    const times = new Map<string, number>();
    let clicks = 0;
    for (let round = 0; round < 3 && clicks < maxClicks; round++) {
      for (const button of within(root()).queryAllByRole('button')) {
        if (clicks >= maxClicks) break;
        const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
          .join('|')
          .trim();
        const count = times.get(label) ?? 0;
        if (count >= 3 || SKIP.test(label) || !usable(button)) continue;
        times.set(label, count + 1);
        clicks++;
        await press(user, button);
      }
    }
    await fill(user, root());
  }

  /**
   * Junta lo que React reporta cuando un componente revienta. Se instala en
   * beforeEach y se consulta al final de cada test.
   */
  function watchCrashes() {
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    return () =>
      errors.filter(
        (args) =>
          // jsdom avisa que no navega (descargas, links externos): no es del frente.
          !args.some((a) => String(a).includes('Not implemented: navigation')) &&
          args.some(
            (a) =>
              a instanceof Error || (typeof a === 'string' && /The above error occurred|Uncaught/.test(a)),
          ),
      );
  }

  return { settle, fill, press, explore, watchCrashes };
}
