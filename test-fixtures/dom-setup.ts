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

  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
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
    const top = open[open.length - 1];
    if (!top) return;
    const cancel = new Event('cancel', { cancelable: true });
    if (top.dispatchEvent(cancel)) top.close();
  });

  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
}
