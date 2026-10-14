/**
 * Lo que jsdom no trae y los frentes usan: matchMedia (modo oscuro), los
 * observers (gráficos, lazy load, scroll), scroll, URLs de objetos para
 * descargas, y el comportamiento modal de <dialog> (incluido cerrar con
 * Escape, como el navegador). Lo importan los setup de los tests de admin y
 * storefront.
 */
export function installDomPolyfills() {
  if (typeof window === 'undefined') return;

  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  window.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.scrollBy ??= () => {};
  Element.prototype.scrollTo ??= () => {};

  // El orden en que se abrieron: el último es el de arriba (la "capa
  // superior" del navegador), que es al que le llega el Escape.
  let shown = 0;
  const shownAt = new WeakMap<HTMLDialogElement, number>();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
    shownAt.set(this, ++shown);
  };
  HTMLDialogElement.prototype.show ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  // Escape sobre un <dialog> modal: el navegador dispara "cancel" y, si nadie
  // lo previene, lo cierra. jsdom no lo hace.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
    const top = open.sort((a, b) => (shownAt.get(a) ?? 0) - (shownAt.get(b) ?? 0))[open.length - 1];
    if (!top) return;
    const cancel = new Event('cancel', { cancelable: true });
    if (top.dispatchEvent(cancel)) top.close();
  });

  // Sin layout no hay nada "en un punto". axe los usa para ubicar el diálogo
  // modal abierto: sin ellos sus reglas fallan y dentro de un <dialog> nada se
  // revisaba.
  document.elementFromPoint ??= () => null;
  document.elementsFromPoint ??= () => [];

  // jsdom no carga Tailwind: un <input type=file class="hidden"> (el patrón de
  // "subir archivo" con un botón propio) le parecería visible a axe.
  const style = document.createElement('style');
  style.textContent = 'input[type=file].hidden { display: none; }';
  document.head.appendChild(style);

  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};

  // El editor de texto con formato (ProseMirror) mide la selección para
  // mantenerla a la vista: jsdom no tiene geometría, alcanza con rectángulos vacíos.
  const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= emptyRects;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);

  // Leer un archivo elegido (la vista previa de un CSV) usa Blob.text(), que
  // jsdom no implementa: se lee con FileReader, que sí tiene.
  Blob.prototype.text ??= function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
