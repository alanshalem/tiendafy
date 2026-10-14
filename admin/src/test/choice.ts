import { screen, within } from '@testing-library/react';

/**
 * Una opción de un selector visual del editor (ChoiceGroup: radios con
 * dibujito) por el nombre del grupo y el de la opción.
 *
 *   await user.click(radio('Forma de las imágenes', 'Cuadrada (1:1)'));
 */
export const radio = (group: string, option: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option });
