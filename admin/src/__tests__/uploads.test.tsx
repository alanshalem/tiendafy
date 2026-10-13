/**
 * Subir archivos en el panel: la ficha de cada lugar (formatos, peso, tamaño
 * ideal), la revisión ANTES de mandar nada, la vista previa con el avance
 * mientras sube y los avisos de lo que se va a ver mal.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MediaUpload, MediaUploadList } from '../components/upload/MediaUpload';
import {
  UPLOADS,
  acceptOf,
  adviceFor,
  describe as describeSpec,
  rejectReason,
  type UploadKind,
} from '../lib/uploads';
import { mockApi, type MockApi } from '../test/api';
import { renderWithProviders } from '../test/render';

/** `applyAccept: false`: el diálogo del sistema filtra, pero arrastrar no; se prueba lo que llega igual. */
const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0, applyAccept: false });
const fileInput = () => document.querySelector('input[type=file]') as HTMLInputElement;
const file = (name: string, bytes: number, type: string) => new File([new Uint8Array(bytes)], name, { type });
const KB = 1024;
const MB = 1024 * KB;

async function mount(ui: React.ReactElement) {
  renderWithProviders(ui);
  await waitFor(() => expect(fileInput()).toBeTruthy());
}

function Single({ kind, initial = '' }: { kind: UploadKind; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MediaUpload kind={kind} value={value} onChange={setValue} />;
}

/** Retiene las subidas a /media hasta que el test las suelte: para mirar el "mientras sube". */
function holdUploads(api: MockApi) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input), 'http://localhost').pathname === '/api/v1/media') await gate;
      return api.fetch(input, init);
    }),
  );
  return release;
}

/** Las imágenes elegidas "miden" esto (jsdom no decodifica imágenes). */
function imagesMeasure(width: number, height: number) {
  class MeasuredImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', MeasuredImage);
}

const mediaCalls = (api: MockApi) => api.calls.filter((c) => c.path === '/api/v1/media');

describe('la ficha de cada lugar', () => {
  it('rechaza antes de subir lo que el servidor no acepta, diciendo por qué', () => {
    expect(rejectReason(UPLOADS.logo, file('logo.gif', 10, 'image/gif'))).toBe(
      'Es un archivo GIF. Acá se puede subir JPG, PNG, WebP, AVIF o SVG.',
    );
    expect(rejectReason(UPLOADS.logo, file('foto.jpg', 6 * MB, 'image/jpeg'))).toBe(
      'Pesa 6 MB y el máximo para JPG es 5 MB. Exportala con menos calidad o en WebP.',
    );
    // El SVG tiene su propio tope (es texto: en el servidor se lee entero).
    expect(rejectReason(UPLOADS.logo, file('logo.svg', 2 * MB, 'image/svg+xml'))).toMatch(
      /máximo para SVG es 1 MB/,
    );
    expect(rejectReason(UPLOADS.logo, file('vacio.png', 0, 'image/png'))).toBe('El archivo está vacío.');
    // Las redes no leen SVG: la imagen al compartir no lo acepta.
    expect(rejectReason(UPLOADS.shareImage, file('og.svg', 10, 'image/svg+xml'))).toMatch(
      /Es un archivo SVG/,
    );

    // Windows informa un .csv como planilla de Excel, o sin tipo: vale por la extensión.
    expect(rejectReason(UPLOADS.productCsv, file('p.csv', 10, 'application/vnd.ms-excel'))).toBeNull();
    expect(rejectReason(UPLOADS.productCsv, file('p.csv', 10, ''))).toBeNull();
    expect(rejectReason(UPLOADS.productCsv, file('p.xlsx', 10, ''))).toMatch(/Es un archivo XLSX/);
    // El ZIP de la carga masiva no tiene tope; cada foto suelta, el de /media.
    expect(rejectReason(UPLOADS.bulkImages, file('fotos.zip', 300 * MB, 'application/zip'))).toBeNull();
    expect(rejectReason(UPLOADS.bulkImages, file('a.jpg', 6 * MB, 'image/jpeg'))).toMatch(/máximo .* 5 MB/);
  });

  it('avisa lo que se va a ver mal, sin bloquear', () => {
    const photo = file('f.jpg', 100 * KB, 'image/jpeg');
    // Banner que llena su lugar: alcanza con que un lado no llegue para verse borroso.
    expect(adviceFor(UPLOADS.carousel, photo, { width: 800, height: 300 })[0]).toBe(
      'Mide 800×300 px y se muestra a 1580×600: se va a ver borrosa.',
    );
    // Proporción muy distinta: se recorta.
    expect(adviceFor(UPLOADS.carousel, photo, { width: 1600, height: 1600 })).toEqual([
      'Es más alta que el lugar (1580×600): se van a recortar los bordes de arriba y abajo.',
    ]);
    expect(adviceFor(UPLOADS.productImage, photo, { width: 2400, height: 1200 })[0]).toMatch(/costados/);
    // Un logo entra entero: uno bien ancho y bajito llega de sobra por el ancho.
    expect(adviceFor(UPLOADS.logo, photo, { width: 575, height: 100 })).toEqual([]);
    expect(adviceFor(UPLOADS.logo, photo, { width: 300, height: 120 })[0]).toMatch(/borrosa/);
    // Justo en el tamaño ideal, nada que decir.
    expect(adviceFor(UPLOADS.shareImage, photo, { width: 1200, height: 630 })).toEqual([]);
    // Pesada: tarda en celular.
    expect(adviceFor(UPLOADS.heroPoster, file('p.jpg', 700 * KB, 'image/jpeg'), null)).toEqual([
      'Pesa 700 KB: en celular con datos móviles tarda en cargar. Conviene que pese menos de 600 KB.',
    ]);
  });

  it('se muestra antes de elegir: formatos, peso, tamaño ideal', () => {
    expect(describeSpec(UPLOADS.logo)).toEqual({
      formats: 'JPG · PNG · WebP · AVIF · SVG',
      weight: 'Hasta 5 MB (SVG: 1 MB)',
      ideal: 'Ideal 575×230 px',
      count: null,
    });
    expect(describeSpec(UPLOADS.heroVideoMp4).weight).toBe('Hasta 20 MB');
    expect(describeSpec(UPLOADS.productImage).count).toBe('Máximo 10');
    expect(describeSpec(UPLOADS.bulkImages).weight).toBe('Hasta 5 MB (ZIP: sin límite, CSV: 25 MB)');
    expect(acceptOf(UPLOADS.logo)).toContain('image/svg+xml');
    expect(acceptOf(UPLOADS.shareImage)).not.toContain('svg');
    expect(acceptOf(UPLOADS.productCsv)).toBe('text/csv,application/vnd.ms-excel,.csv');
  });
});

describe('subir una imagen o un video', () => {
  it('antes de elegir muestra la ficha; mientras sube, la vista previa con el avance; al terminar, la imagen', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/logo.png' });
    const release = holdUploads(api);
    const u = user();
    await mount(<Single kind="logo" />);
    expect(screen.getByText('JPG · PNG · WebP · AVIF · SVG')).toBeInTheDocument();
    expect(screen.getByText('Ideal 575×230 px')).toBeInTheDocument();
    expect(fileInput().accept).toContain('.svg');

    await u.upload(fileInput(), file('logo.png', 20 * KB, 'image/png'));
    const bar = await screen.findByRole('progressbar', { name: 'Subiendo logo.png' });
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '50'));
    expect(screen.getByText('Subiendo… 50 %')).toBeInTheDocument();
    // La vista previa es el archivo elegido, todavía local.
    expect(document.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^blob:/));

    release();
    await waitFor(() =>
      expect(document.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/logo.png'),
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(mediaCalls(api)).toHaveLength(1);

    // Reemplazar abre el mismo diálogo; quitar la deja vacía.
    const click = vi.spyOn(fileInput(), 'click');
    await u.click(screen.getByRole('button', { name: /Reemplazar/ }));
    expect(click).toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: /Elegir imagen/ })).toBeInTheDocument();
  });

  it('un formato que no sirve o un archivo muy pesado no se manda, ni elegido ni arrastrado', async () => {
    const api = mockApi();
    const u = user();
    await mount(<Single kind="logo" />);

    fireEvent.drop(screen.getByRole('button', { name: /Elegir imagen/ }), {
      dataTransfer: { files: [file('animado.gif', 10 * KB, 'image/gif')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Es un archivo GIF. Acá se puede subir JPG, PNG, WebP, AVIF o SVG.',
    );

    await u.upload(fileInput(), file('enorme.jpg', 8 * MB, 'image/jpeg'));
    expect(await screen.findByText(/Pesa 8 MB y el máximo para JPG es 5 MB/)).toBeInTheDocument();
    expect(mediaCalls(api)).toHaveLength(0);

    // El aviso se cierra.
    await u.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa si va a quedar borrosa o pesada, pero la sube igual', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/og.jpg' });
    imagesMeasure(600, 315);
    const u = user();
    await mount(<Single kind="shareImage" />);
    await u.upload(fileInput(), file('og.jpg', 700 * KB, 'image/jpeg'));

    const advice = await screen.findByRole('status');
    await waitFor(() =>
      expect(advice).toHaveTextContent(/Mide 600×315 px y se muestra a 1200×630: se va a ver borrosa/),
    );
    expect(advice).toHaveTextContent(/Pesa 700 KB/);
    await waitFor(() =>
      expect(document.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/og.jpg'),
    );
  });

  it('si el servidor la rechaza lo dice ahí mismo; una subida se puede cancelar', async () => {
    const api = mockApi();
    api.on(
      'POST',
      '/api/v1/media',
      { detail: 'El contenido del archivo no coincide con el tipo declarado.' },
      400,
    );
    const u = user();
    await mount(<Single kind="promoBanner" />);
    await u.upload(fileInput(), file('banner.png', 10 * KB, 'image/png'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El contenido del archivo no coincide con el tipo declarado.',
    );

    // Un 502 del proxy no tiene explicación: se dice algo útil, no el código.
    api.on('POST', '/api/v1/media', '', 502);
    await u.upload(fileInput(), file('banner.png', 10 * KB, 'image/png'));
    expect(await screen.findByText('No se pudo subir. Probá de nuevo en un rato.')).toBeInTheDocument();

    holdUploads(api);
    await u.upload(fileInput(), file('banner.png', 10 * KB, 'image/png'));
    await u.click(await screen.findByRole('button', { name: 'Cancelar subida de banner.png' }));
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // cancelar no es un error
    expect(screen.getByRole('button', { name: /Elegir imagen/ })).toBeInTheDocument();
  });

  it('video: acepta solo su formato, sube, se muestra y se quita', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/clip.mp4' });
    const u = user();
    await mount(<Single kind="heroVideoMp4" />);
    expect(fileInput().accept).toBe('video/mp4,.mp4');
    expect(screen.getByText('Hasta 20 MB')).toBeInTheDocument();

    await u.upload(fileInput(), file('clip.webm', 100, 'video/webm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Acá se puede subir MP4.');

    await u.upload(fileInput(), file('clip.mp4', 100, 'video/mp4'));
    await waitFor(() =>
      expect(document.querySelector('video')).toHaveAttribute('src', 'https://cdn.example/clip.mp4'),
    );
    await u.click(screen.getByRole('button', { name: 'Quitar video' }));
    expect(document.querySelector('video')).toBeNull();
  });
});

describe('varias imágenes en orden', () => {
  function List({ initial, spy }: { initial: string[]; spy: (v: string[]) => void }) {
    const [values, setValues] = useState(initial);
    return (
      <MediaUploadList
        kind="carousel"
        values={values}
        onChange={(next) => {
          spy(next);
          setValues(next);
        }}
      />
    );
  }

  it('suben de a una y en orden; la que no sirve queda afuera con su motivo; se ordenan y se quitan', async () => {
    const api = mockApi();
    let n = 0;
    api.on('POST', '/api/v1/media', () => ({ url: `https://cdn.example/nueva-${++n}.jpg` }));
    const spy = vi.fn();
    const u = user();
    const a = 'https://cdn.example/a.jpg';
    const b = 'https://cdn.example/b.jpg';
    await mount(<List initial={[a, b]} spy={spy} />);

    const [beforeA, beforeB] = screen.getAllByRole('button', { name: 'Mover antes' });
    const [, afterB] = screen.getAllByRole('button', { name: 'Mover después' });
    expect(beforeA).toBeDisabled();
    expect(afterB).toBeDisabled();
    await u.click(beforeB!);
    expect(spy).toHaveBeenLastCalledWith([b, a]);
    await u.click(screen.getAllByRole('button', { name: 'Quitar imagen' })[0]!);
    expect(spy).toHaveBeenLastCalledWith([a]);

    await u.upload(fileInput(), [
      file('uno.jpg', 10 * KB, 'image/jpeg'),
      file('dos.gif', 10 * KB, 'image/gif'),
      file('tres.jpg', 10 * KB, 'image/jpeg'),
    ]);
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith([
        a,
        'https://cdn.example/nueva-1.jpg',
        'https://cdn.example/nueva-2.jpg',
      ]),
    );
    expect(mediaCalls(api)).toHaveLength(2);
    expect(within(screen.getByRole('alert')).getByText('dos.gif:')).toBeInTheDocument();
  });
});

describe('un solo camino para subir', () => {
  it('ningún lugar del panel arma su propio <input type="file">: todos pasan por components/upload', () => {
    const sources = import.meta.glob<string>(['../**/*.tsx', '!../__tests__/**'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const withInput = Object.entries(sources)
      .filter(([, code]) => /type=["']file["']/.test(code))
      .map(([path]) => path);
    expect(withInput).toEqual(['../components/upload/primitives.tsx']);
  });
});
