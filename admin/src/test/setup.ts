/**
 * Entorno de los tests de componentes del panel: matchers del DOM, limpieza
 * entre tests y los polyfills de jsdom compartidos con el storefront.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { installDomPolyfills } from '../../../test-fixtures/dom-setup';

installDomPolyfills();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
