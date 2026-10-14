/**
 * Entorno de los tests de componentes del panel: matchers del DOM, limpieza
 * entre tests y los polyfills de jsdom compartidos con el storefront.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { installDomPolyfills } from '../../../test-fixtures/dom-setup';
import { installFetchBackedXhr } from './xhr';

installDomPolyfills();
// findBy*/waitFor esperan 3 s y no 1: el runner de CI es varias veces más
// lento que una máquina local, y una pantalla que tarda en aparecer ahí no es
// un bug. Lo que de verdad no aparece sigue fallando, solo que a los 3 s.
configure({ asyncUtilTimeout: 3000 });
installFetchBackedXhr();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  // Los listados recuerdan sus filtros en la pestaña (useListParams): sin
  // esto, un test heredaría los filtros que dejó el anterior.
  sessionStorage.clear();
});
