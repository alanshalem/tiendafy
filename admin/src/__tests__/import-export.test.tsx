/**
 * Importación masiva de productos y de imágenes: plantillas para completar,
 * vista previa del CSV (con ; o , y comillas), encolar el trabajo y seguirlo
 * hasta que termina (o falla), con el detalle de las filas con problemas.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const downloadCsv = vi.hoisted(() => vi.fn());
vi.mock('../pages/Products/import-templates', async (original) => ({
  ...(await original<typeof import('../pages/Products/import-templates')>()),
  downloadCsv,
}));

const IMPORT = '/api/v1/products/import';
const IMAGES = '/api/v1/products/images/import';

const job = (over: Record<string, unknown>) => ({
  jobId: 'job-1',
  status: 'processing',
  totalProducts: 4,
  processed: 2,
  created: 1,
  updated: 1,
  skipped: 0,
  imagesImported: 0,
  errorCount: 0,
  errors: [],
  failureMessage: null,
  ...over,
});

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  downloadCsv.mockReset();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openTab(tab: 'Importar' | 'Imágenes', setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/exportar-importar');
  expect(
    await screen.findByRole('heading', { name: 'Exportar e importar' }, { timeout: 5000 }),
  ).toBeInTheDocument();
  const tabButton = screen.getAllByRole('button', { name: tab }).find((b) => b.hasAttribute('aria-pressed'))!;
  await user.click(tabButton);
  expect(tabButton).toHaveAttribute('aria-pressed', 'true');
  await settle(2);
  return { api, user };
}

const submit = () =>
  screen.getAllByRole('button', { name: /^Importar$/ }).find((b) => !b.hasAttribute('aria-pressed'))!;

const csvInput = () => document.querySelector('input[type=file][accept*=csv]') as HTMLInputElement;

describe('importar productos', () => {
  it('las plantillas se descargan (vacía y con ejemplos)', async () => {
    const { user } = await openTab('Importar');
    await user.click(screen.getByRole('button', { name: /Plantilla vacía/ }));
    expect(downloadCsv).toHaveBeenLastCalledWith('plantilla-productos-vacia.csv', expect.any(String));
    expect(await screen.findByText(/Plantilla vacía descargada/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Plantilla con ejemplos/ }));
    expect(downloadCsv).toHaveBeenLastCalledWith('plantilla-productos-ejemplos.csv', expect.any(String));
  });

  it('vista previa del CSV, encolar y seguir el trabajo hasta que termina', async () => {
    const { api, user } = await openTab('Importar', (a) => {
      a.on('POST', IMPORT, { jobId: 'job-1', totalProducts: 4 });
      a.on('GET', `${IMPORT}/job-1`, job({ status: 'queued', processed: 0 }));
    });
    // Excel en castellano exporta con ; y comillas dobles escapadas.
    const csv = '﻿slug;nombre;precio\nremera;"Remera ""Clásica""";100\ngorra;Gorra;50\n';
    await user.upload(csvInput(), new File([csv], 'productos.csv', { type: 'text/csv' }));
    expect(await screen.findByText('Vista previa de las primeras filas')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'slug' })).toBeInTheDocument();
    expect(screen.getByText('Remera "Clásica"')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Modificar productos ya existentes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Actualizar stock' }));
    await user.click(submit());
    expect(await screen.findByText('En cola…')).toBeInTheDocument();

    api.on('GET', `${IMPORT}/job-1`, job({}));
    expect(await screen.findByText('Importando productos…', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument();

    api.on(
      'GET',
      `${IMPORT}/job-1`,
      job({
        status: 'completed',
        processed: 4,
        created: 3,
        updated: 1,
        errorCount: 1,
        errors: [{ line: 3, slug: 'gorra', message: 'Precio inválido' }],
      }),
    );
    expect(
      await screen.findByText('Importación lista: +3 nuevos · 1 actualizados', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 fila(s) con problemas')).toBeInTheDocument();
    expect(screen.getByText(/Precio inválido/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Importar otro archivo' }));
    expect(screen.queryByText('Vista previa de las primeras filas')).not.toBeInTheDocument();
  });

  it('si el trabajo falla o no se puede encolar, lo dice', async () => {
    const { api, user } = await openTab('Importar', (a) =>
      a.on('POST', IMPORT, { detail: 'El archivo supera las 20000 líneas.' }, 400),
    );
    await user.upload(csvInput(), new File(['slug,nombre\nremera,Remera\n'], 'p.csv', { type: 'text/csv' }));
    await waitFor(() => expect(submit()).toBeEnabled());
    await user.click(submit());
    expect(await screen.findByText('El archivo supera las 20000 líneas.')).toBeInTheDocument();

    api.on('POST', IMPORT, { jobId: 'job-2', totalProducts: 1 });
    api.on(
      'GET',
      `${IMPORT}/job-2`,
      job({ jobId: 'job-2', status: 'failed', failureMessage: 'Columnas desconocidas.' }),
    );
    await user.click(submit());
    expect(await screen.findByText('Columnas desconocidas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar otro archivo' })).toBeInTheDocument();
  });

  it('un fallo sin mensaje usa el genérico', async () => {
    await openTab('Importar', (a) => {
      a.on('POST', IMPORT, { jobId: 'job-3', totalProducts: 1 });
      a.on('GET', `${IMPORT}/job-3`, job({ jobId: 'job-3', status: 'failed', failureMessage: null }));
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await user.upload(csvInput(), new File(['slug\nremera\n'], 'p.csv', { type: 'text/csv' }));
    await waitFor(() => expect(submit()).toBeEnabled());
    await user.click(submit());
    expect(await screen.findByText('La importación falló')).toBeInTheDocument();
  });
});

describe('importar imágenes', () => {
  const imageJob = (over: Record<string, unknown>) => ({
    jobId: 'img-1',
    status: 'processing',
    totalFiles: 3,
    processed: 1,
    imagesAdded: 1,
    matchedProducts: 1,
    unmatchedFiles: 0,
    unmatchedSample: [],
    failureMessage: null,
    ...over,
  });

  it('sube los archivos, sigue el trabajo y muestra el resultado', async () => {
    const { api, user } = await openTab('Imágenes', (a) => {
      a.on('POST', IMAGES, { jobId: 'img-1', totalFiles: 3 });
      a.on('GET', `${IMAGES}/img-1`, imageJob({ status: 'queued', processed: 0 }));
    });
    const input = document.querySelector('input[type=file][multiple]') as HTMLInputElement;
    const start = () => screen.getByRole('button', { name: /Importar imágenes/ });
    expect(start()).toBeDisabled();
    await user.upload(input, [
      new File(['a'], 'remera-1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'remera-2.jpg', { type: 'image/jpeg' }),
    ]);
    await user.click(start());
    expect(await screen.findByText('En cola…')).toBeInTheDocument();
    api.on('GET', `${IMAGES}/img-1`, imageJob({}));
    expect(await screen.findByText('Subiendo imágenes…', {}, { timeout: 3000 })).toBeInTheDocument();
    api.on(
      'GET',
      `${IMAGES}/img-1`,
      imageJob({
        status: 'completed',
        processed: 3,
        imagesAdded: 2,
        matchedProducts: 1,
        unmatchedFiles: 1,
        unmatchedSample: ['zapato.jpg'],
      }),
    );
    expect(
      await screen.findByText('2 imágenes subidas a 1 productos', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('zapato.jpg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Subir más imágenes' }));
    expect(start()).toBeInTheDocument();
  });

  it('si no se puede subir o el trabajo falla, lo dice', async () => {
    const { api, user } = await openTab('Imágenes', (a) =>
      a.on('POST', IMAGES, { detail: 'El zip está dañado.' }, 400),
    );
    const input = document.querySelector('input[type=file][multiple]') as HTMLInputElement;
    await user.upload(input, new File(['z'], 'fotos.zip', { type: 'application/zip' }));
    await user.click(screen.getByRole('button', { name: /Importar imágenes/ }));
    expect(await screen.findByText('El zip está dañado.')).toBeInTheDocument();

    api.on('POST', IMAGES, { jobId: 'img-2', totalFiles: 1 });
    api.on('GET', `${IMAGES}/img-2`, imageJob({ jobId: 'img-2', status: 'failed', failureMessage: null }));
    await user.click(screen.getByRole('button', { name: /Importar imágenes/ }));
    expect(await screen.findByText('La importación de imágenes falló')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(document.body).getByRole('button', { name: 'Subir más imágenes' })).toBeInTheDocument(),
    );
  });
});
