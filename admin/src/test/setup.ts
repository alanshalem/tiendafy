/**
 * Entorno de los tests de componentes del panel: matchers del DOM, limpieza
 * entre tests y los polyfills de jsdom compartidos con el storefront.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { installDomPolyfills } from '../../../test-fixtures/dom-setup';
import { installFetchBackedXhr } from './xhr';

installDomPolyfills();
installFetchBackedXhr();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  // Los listados recuerdan sus filtros en la pestaña (useListParams): sin
  // esto, un test heredaría los filtros que dejó el anterior.
  sessionStorage.clear();
});
