/**
 * La prueba exploratoria de la tienda (ver test-fixtures/explore.ts), con la
 * Testing Library y el `vi` de este proyecto.
 */
import { act, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { createExplorer } from '../../../test-fixtures/explore';

export const { settle, explore, watchCrashes } = createExplorer({ act, screen, within }, vi);
