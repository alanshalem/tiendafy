/**
 * El editor de texto enriquecido cargado a demanda: una vez bajado es el
 * mismo editor, con las mismas props (nombre accesible incluido).
 */
import { screen } from '@testing-library/react';
import { mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';
import { describe, expect, it, vi } from 'vitest';
import { LazyRichTextEditor } from '../components/LazyRichTextEditor';

describe('LazyRichTextEditor', () => {
  it('termina siendo el mismo editor, con su nombre y su contenido', async () => {
    mockApi();
    renderWithProviders(
      <>
        <p id="titulo">Contenido</p>
        <LazyRichTextEditor labelledBy="titulo" value="<p>Hola</p>" onChange={vi.fn()} />
      </>,
    );
    expect(await screen.findByText('Hola')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando el editor…' })).toBeNull();
  });
});
