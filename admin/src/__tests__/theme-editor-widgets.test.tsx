/**
 * Piezas sueltas del editor de diseño, de a una: el buscador de opciones
 * (Ctrl+K) y el selector de productos. Los uploaders están en uploads.test.tsx.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OPTION_INDEX, OptionSearch, searchOptions } from '../pages/theme-editor-search';
import { ProductPicker } from '../pages/theme-editor-pickers';
import { fixture, mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

/** Con los providers del panel (que esperan la sesión antes de mostrar nada). */
async function mount(ui: React.ReactElement) {
  renderWithProviders(ui);
  await waitFor(() => expect(document.querySelector('input')).toBeTruthy());
}

describe('buscador de opciones', () => {
  it('encuentra sin acentos, con varias palabras y hasta 12 resultados', () => {
    expect(searchOptions('')).toEqual([]);
    expect(searchOptions('   ')).toEqual([]);
    expect(searchOptions('PIE DE PAGINA').length).toBeGreaterThan(0);
    expect(searchOptions('redes instagram').map((e) => e.label)).toContain('Redes sociales');
    expect(searchOptions('zzz-no-existe')).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `Opción ${i}`, view: 'x', panel: 'P' }));
    expect(searchOptions('opcion', many)).toHaveLength(12);
    expect(OPTION_INDEX.length).toBeGreaterThan(12);
  });

  it('se maneja con el teclado y el mouse', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const u = user();
    mockApi();
    await mount(<OptionSearch onPick={onPick} onClose={onClose} />);
    const input = screen.getByPlaceholderText(/Buscar una opción/);
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByText(/Escribí qué querés cambiar/)).toBeInTheDocument();

    await u.type(input, 'qwerty');
    expect(screen.getByText(/Nada con «qwerty»/)).toBeInTheDocument();
    await u.clear(input);

    await u.type(input, 'pie');
    const results = screen.getAllByRole('option');
    expect(results.length).toBeGreaterThan(2);
    // Flechas: no pasan del primero ni del último.
    await u.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowDown}');
    expect(results[1]).toHaveAttribute('aria-selected', 'true');
    await u.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('footer');
    expect(onClose).toHaveBeenCalledTimes(1);

    await u.hover(results[2]!);
    expect(results[2]).toHaveAttribute('aria-selected', 'true');
    await u.click(results[2]!);
    expect(onPick).toHaveBeenCalledTimes(2);

    // Clic adentro no cierra; Escape (en el campo) y clic afuera, sí.
    await u.click(input);
    expect(onClose).toHaveBeenCalledTimes(2);
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
    await u.click(input.closest('.fixed')!);
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});

describe('selector de productos (destacados)', () => {
  type P = { id: string; name: string };
  const products = fixture<{ items: P[] }>('/api/v1/products').items;

  /** El selector con estado, como en la sección de destacados. */
  function Picker({ initial = [] as string[], spy }: { initial?: string[]; spy: (ids: string[]) => void }) {
    const [ids, setIds] = useState(initial);
    return (
      <ProductPicker
        value={ids}
        onChange={(next) => {
          spy(next);
          setIds(next);
        }}
      />
    );
  }

  it('busca en la base, agrega, quita y reordena arrastrando', async () => {
    mockApi();
    const spy = vi.fn();
    const u = user();
    const [a, b, c] = products;
    await mount(<Picker initial={[a!.id, b!.id]} spy={spy} />);
    // Los ya elegidos tienen nombre (consulta por ids).
    expect(await screen.findByText(a!.name)).toBeInTheDocument();

    await u.type(screen.getByPlaceholderText('Buscar productos para agregar…'), c!.name.slice(0, 4));
    // Los ya elegidos no se ofrecen de nuevo.
    const option = await screen.findByRole('button', { name: c!.name }, { timeout: 3000 });
    expect(screen.queryAllByRole('button', { name: a!.name })).toHaveLength(0);
    await u.click(option);
    expect(spy).toHaveBeenLastCalledWith([a!.id, b!.id, c!.id]);
    expect(screen.getByPlaceholderText('Buscar productos para agregar…')).toHaveValue('');

    // Arrastrar el último arriba de todo.
    const chips = () => Array.from(document.querySelectorAll<HTMLElement>('[draggable=true]'));
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? '',
    };
    fireEvent.dragStart(chips()[2]!, { dataTransfer });
    fireEvent.dragOver(chips()[0]!, { dataTransfer });
    fireEvent.drop(chips()[0]!, { dataTransfer });
    fireEvent.dragEnd(chips()[2]!, { dataTransfer });
    expect(spy).toHaveBeenLastCalledWith([c!.id, a!.id, b!.id]);
    // Soltar sobre sí mismo no cambia nada.
    const calls = spy.mock.calls.length;
    fireEvent.dragStart(chips()[0]!, { dataTransfer });
    fireEvent.drop(chips()[0]!, { dataTransfer });
    expect(spy.mock.calls.length).toBe(calls);

    await u.click(screen.getAllByRole('button', { name: 'Quitar' })[0]!);
    expect(spy).toHaveBeenLastCalledWith([a!.id, b!.id]);
  });

  it('sin resultados lo dice', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/products', { items: [], total: 0 });
    const u = user();
    await mount(<Picker spy={vi.fn()} />);
    await u.type(screen.getByPlaceholderText('Buscar productos para agregar…'), 'nada');
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    expect(await screen.findByText('Sin resultados.', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
