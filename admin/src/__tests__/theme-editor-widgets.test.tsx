/**
 * Piezas sueltas del editor de diseño, de a una: el buscador de opciones
 * (Ctrl+K) y los uploaders de imagen, video y carrusel.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OPTION_INDEX, OptionSearch, searchOptions } from '../pages/theme-editor-search';
import { ProductPicker } from '../pages/theme-editor-pickers';
import { ImageUploader, MultiImageUploader, VideoUploader } from '../pages/theme-editor-uploaders';
import { fixture, mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

const fileInput = () => document.querySelector('input[type=file]') as HTMLInputElement;

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
    const results = screen.getAllByRole('button');
    expect(results.length).toBeGreaterThan(2);
    // Flechas: no pasan del primero ni del último.
    await u.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowDown}');
    expect(results[1]).toHaveClass('bg-primary');
    await u.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('footer');
    expect(onClose).toHaveBeenCalledTimes(1);

    await u.hover(results[2]!);
    expect(results[2]).toHaveClass('bg-primary');
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

/** Un uploader con estado, como lo usa el editor. */
function Harness({ kind }: { kind: 'image' | 'svg' | 'video' }) {
  const [value, setValue] = useState('');
  if (kind === 'video')
    return <VideoUploader value={value} onChange={setValue} accept="video/mp4" label="Elegir video" />;
  return <ImageUploader value={value} onChange={setValue} allowSvg={kind === 'svg'} />;
}

const file = (name: string, bytes: number, type: string) => new File([new Uint8Array(bytes)], name, { type });

describe('uploaders', () => {
  it('sube una imagen, avisa si pesa mucho y se puede quitar', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/foto.jpg' });
    const u = user();
    await mount(<Harness kind="image" />);
    expect(fileInput().accept).not.toContain('svg');

    await u.upload(fileInput(), file('foto.jpg', 700 * 1024, 'image/jpeg'));
    expect(await screen.findByText(/La imagen pesa 700 KB/)).toBeInTheDocument();
    expect(document.querySelector('img')!.getAttribute('src')).toBe('https://cdn.example/foto.jpg');

    await u.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    expect(document.querySelector('img')).toBeNull();

    // Una liviana no avisa; una de más de 1 MB se informa en MB.
    await u.upload(fileInput(), file('chica.png', 10 * 1024, 'image/png'));
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    await u.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    await u.upload(fileInput(), file('grande.jpg', 2 * 1024 * 1024, 'image/jpeg'));
    expect(await screen.findByText(/La imagen pesa 2.0 MB/)).toBeInTheDocument();
  });

  it('el logo acepta SVG y un error de subida se muestra legible', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { detail: 'El archivo no es una imagen válida.' }, 400);
    const u = user();
    await mount(<Harness kind="svg" />);
    expect(fileInput().accept).toContain('image/svg+xml');
    await u.upload(fileInput(), file('logo.svg', 100, 'image/svg+xml'));
    expect(await screen.findByText('El archivo no es una imagen válida.')).toBeInTheDocument();
    // Sin archivo (se canceló el diálogo) no hace nada.
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(api.calls.filter((c) => c.path === '/api/v1/media')).toHaveLength(1);
  });

  it('video: sube, muestra y se quita; si falla, lo dice', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { detail: 'El video supera los 20 MB.' }, 413);
    const u = user();
    await mount(<Harness kind="video" />);
    await u.upload(fileInput(), file('clip.mp4', 100, 'video/mp4'));
    expect(await screen.findByText('El video supera los 20 MB.')).toBeInTheDocument();

    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/clip.mp4' });
    await u.upload(fileInput(), file('clip.mp4', 100, 'video/mp4'));
    await waitFor(() =>
      expect(document.querySelector('video')?.getAttribute('src')).toBe('https://cdn.example/clip.mp4'),
    );
    await u.click(screen.getByRole('button', { name: 'Quitar video' }));
    expect(document.querySelector('video')).toBeNull();
  });

  it('carrusel: agrega, ordena y quita imágenes', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/c.jpg' });
    const onChange = vi.fn();
    const u = user();
    const a = 'https://cdn.example/a.jpg';
    const b = 'https://cdn.example/b.jpg';
    await mount(<MultiImageUploader images={[a, b]} onChange={onChange} />);
    const [upA, upB] = screen.getAllByRole('button', { name: 'Subir' });
    const [downA, downB] = screen.getAllByRole('button', { name: 'Bajar' });
    expect(upA).toBeDisabled();
    expect(downB).toBeDisabled();
    await u.click(upB!);
    expect(onChange).toHaveBeenLastCalledWith([b, a]);
    await u.click(downA!);
    expect(onChange).toHaveBeenLastCalledWith([b, a]);
    await u.click(screen.getAllByRole('button', { name: 'Quitar' })[0]!);
    expect(onChange).toHaveBeenLastCalledWith([b]);

    await u.upload(fileInput(), file('c.jpg', 100, 'image/jpeg'));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([a, b, 'https://cdn.example/c.jpg']));
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
