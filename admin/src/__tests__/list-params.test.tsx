/**
 * Los parámetros de los listados en la URL (lib/useListParams): tipos y
 * defaults, volver a la página 1 al filtrar, «Atrás» deshace el último filtro
 * pero no cada tecla de la búsqueda, la memoria por pestaña (volver a
 * /productos sin parámetros recupera los últimos) y el registro abierto como
 * parámetro (?orden=<id>) que se cierra con «Atrás».
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useListParams, useListSearch, useRecordParam } from '../lib/useListParams';

const DEFAULTS = { q: '', estado: '', pagina: 1, inactivos: false };

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Atrás
    </button>
  );
}

function List({ storageKey }: { storageKey?: string }) {
  const list = useListParams(DEFAULTS, { storageKey });
  const [text, setText] = useListSearch(list);
  return (
    <div>
      <input aria-label="Buscar" value={text} onChange={(e) => setText(e.target.value)} />
      <span data-testid="values">{JSON.stringify(list.values)}</span>
      <span data-testid="filtered">{String(list.filtered)}</span>
      <button type="button" onClick={() => list.set({ estado: 'PAID' })}>
        Pagadas
      </button>
      <button type="button" onClick={() => list.set({ pagina: list.values.pagina + 1 })}>
        Siguiente
      </button>
      <button type="button" onClick={() => list.set({ inactivos: !list.values.inactivos })}>
        Inactivos
      </button>
      <button type="button" onClick={list.reset}>
        Limpiar
      </button>
    </div>
  );
}

function renderAt(path: string, ui = <List />, extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/inicio', path]} initialIndex={1}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              {ui}
              <Where />
              <Back />
              {extra}
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const where = () => screen.getByTestId('where').textContent;
const values = () => JSON.parse(screen.getByTestId('values').textContent!);

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.useRealTimers());

describe('useListParams', () => {
  it('lee la URL con los tipos de los defaults y no escribe lo que es default', () => {
    renderAt('/ventas?estado=PAID&pagina=3&inactivos=1&order=abc');
    expect(values()).toEqual({ q: '', estado: 'PAID', pagina: 3, inactivos: true });
    expect(screen.getByTestId('filtered').textContent).toBe('true');

    // Un número inválido vuelve al default; un filtro nuevo vuelve a la página 1
    // y respeta los parámetros que no son del listado.
    fireEvent.click(screen.getByText('Inactivos'));
    expect(where()).toBe('/ventas?estado=PAID&order=abc');
  });

  it('cambiar de página no la resetea; Atrás deshace el último cambio', () => {
    renderAt('/ventas');
    fireEvent.click(screen.getByText('Pagadas'));
    fireEvent.click(screen.getByText('Siguiente'));
    expect(where()).toBe('/ventas?estado=PAID&pagina=2');
    fireEvent.click(screen.getByText('Atrás'));
    expect(where()).toBe('/ventas?estado=PAID');
    fireEvent.click(screen.getByText('Limpiar'));
    expect(where()).toBe('/ventas');
    expect(values().pagina).toBe(1);
  });

  it('la búsqueda espera a que se deje de tipear y reemplaza la entrada del historial', () => {
    vi.useFakeTimers();
    renderAt('/ventas?pagina=4');
    const input = screen.getByLabelText('Buscar');
    fireEvent.change(input, { target: { value: 'an' } });
    fireEvent.change(input, { target: { value: 'ana ' } });
    expect(where()).toBe('/ventas?pagina=4');
    act(() => vi.advanceTimersByTime(400));
    // Sin recortar mientras se escribe: el espacio del final sigue en la caja.
    expect(where()).toBe('/ventas?q=ana+');
    expect((input as HTMLInputElement).value).toBe('ana ');

    // Reemplazó: Atrás sale de la pantalla en vez de volver a "an".
    fireEvent.click(screen.getByText('Atrás'));
    expect(where()).toBe('/inicio');
  });

  it('si la URL cambia por fuera, la caja de búsqueda la sigue', () => {
    renderAt('/ventas?q=ana');
    expect(screen.getByLabelText('Buscar')).toHaveValue('ana');
    fireEvent.click(screen.getByText('Limpiar'));
    expect(screen.getByLabelText('Buscar')).toHaveValue('');
  });

  it('con memoria: al volver sin parámetros recupera los últimos de la pestaña', () => {
    const first = renderAt('/productos?estado=draft&pagina=2', <List storageKey="productos" />);
    first.unmount();

    // Entra sin nada (como después de guardar un producto).
    const second = renderAt('/productos', <List storageKey="productos" />);
    expect(where()).toBe('/productos?estado=draft&pagina=2');
    expect(values().estado).toBe('draft');

    // Limpiar también se recuerda: la próxima vez entra limpio.
    fireEvent.click(screen.getByText('Limpiar'));
    second.unmount();
    renderAt('/productos', <List storageKey="productos" />);
    expect(where()).toBe('/productos');
  });

  it('un link con parámetros manda sobre lo recordado', () => {
    renderAt('/productos?estado=draft', <List storageKey="productos" />).unmount();
    renderAt('/productos?estado=archived', <List storageKey="productos" />);
    expect(values().estado).toBe('archived');
  });

  it('sin sessionStorage disponible, igual funciona (sin memoria)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    renderAt('/productos?estado=draft', <List storageKey="productos" />);
    expect(values().estado).toBe('draft');
    spy.mockRestore();
    set.mockRestore();
  });
});

function Record() {
  const { id, open, close, searchFor } = useRecordParam('orden');
  return (
    <div>
      <span data-testid="open">{id ?? 'ninguna'}</span>
      <span data-testid="href">{searchFor('xyz')}</span>
      <button type="button" onClick={() => open('abc')}>
        Abrir
      </button>
      <button type="button" onClick={close}>
        Cerrar
      </button>
    </div>
  );
}

describe('useRecordParam', () => {
  it('abrir suma una entrada; cerrar vuelve atrás a la lista con sus filtros', () => {
    renderAt('/compras?estado=draft', <Record />);
    expect(screen.getByTestId('href').textContent).toBe('?estado=draft&orden=xyz');
    fireEvent.click(screen.getByText('Abrir'));
    expect(where()).toBe('/compras?estado=draft&orden=abc');
    expect(screen.getByTestId('open').textContent).toBe('abc');
    fireEvent.click(screen.getByText('Cerrar'));
    expect(where()).toBe('/compras?estado=draft');
  });

  it('llegando directo por un link, cerrar no saca de la app: queda en la lista', () => {
    renderAt('/compras?orden=abc', <Record />);
    fireEvent.click(screen.getByText('Cerrar'));
    expect(where()).toBe('/compras');
    fireEvent.click(screen.getByText('Atrás'));
    expect(where()).toBe('/inicio');
  });
});
