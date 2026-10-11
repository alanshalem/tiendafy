/**
 * La prueba exploratoria del panel (ver test-fixtures/explore.ts), con la
 * Testing Library y el `vi` de este proyecto.
 */
import { act, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { createExplorer } from '../../../test-fixtures/explore';

export type { User } from '../../../test-fixtures/explore';
export { SKIP } from '../../../test-fixtures/explore';

export const { settle, fill, press, explore, watchCrashes } = createExplorer({ act, screen, within }, vi);
