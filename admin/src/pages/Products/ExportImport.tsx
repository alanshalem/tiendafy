import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Download, ExternalLink, Plus, Upload, X } from 'lucide-react';
import { Button, Card, Checkbox, cn, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, ApiRequestError } from '../../lib/api';

// Cabecera completa del CSV (Excel es-AR usa ';').
const CSV_HEADER = [
  'Identificador de URL',
  'Nombre',
  'Categorías',
  'Nombre de propiedad 1',
  'Valor de propiedad 1',
  'Nombre de propiedad 2',
  'Valor de propiedad 2',
  'Precio',
  'Precio promocional',
  'Peso (kg)',
  'Alto (cm)',
  'Ancho (cm)',
  'Profundidad (cm)',
  'Stock',
  'SKU',
  'Código de barras',
  'Mostrar en tienda',
  'Envío sin cargo',
  'Descripción',
  'Imágenes',
  'Tags',
  'Título para SEO',
  'Descripción para SEO',
];

// Filas de ejemplo: producto con variantes (con 2 imágenes) y producto simple.
// La columna "Imágenes" admite varias URLs separadas por espacio; al importar
// se descargan y re-hospedan en el storage de la tienda.
const TEMPLATE_EXAMPLES = [
  ['remera-oversize', 'Remera Oversize', 'Indumentaria > Remeras', 'Talle', 'S', '', '', '12990', '', '0.2', '', '', '', '10', 'REM-S', '', 'SI', 'NO', 'Remera de algodón premium', 'https://picsum.photos/seed/remera/800 https://picsum.photos/seed/remera-2/800', 'remera,oversize', '', ''],
  ['remera-oversize', 'Remera Oversize', 'Indumentaria > Remeras', 'Talle', 'M', '', '', '12990', '9990', '0.2', '', '', '', '8', 'REM-M', '', 'SI', 'NO', '', '', '', '', ''],
  ['mate-imperial', 'Mate Imperial', 'Bazar', '', '', '', '', '8500', '', '0.4', '', '', '', '25', 'MATE-01', '', 'SI', 'NO', 'Mate de calabaza forrado en cuero', 'https://picsum.photos/seed/mate/800', 'mate,regalo', '', ''],
];

function buildCsv(rows: string[][]): string {
  const escape = (c: string) => `"${c.replace(/"/g, '""')}"`;
  return '﻿' + rows.map((r) => r.map(escape).join(';')).join('\n');
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, content: string) {
  downloadBlob(filename, new Blob([content], { type: 'text/csv;charset=utf-8' }));
}

const TABS = { export: 'Exportar', import: 'Importar', images: 'Imágenes' } as const;
type Tab = keyof typeof TABS;

export function ExportImportPage() {
  const [tab, setTab] = useState<Tab>('export');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/productos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" /> Productos
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-fg">Exportar e importar</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Economizá tiempo modificando o agregando nuevos productos de forma masiva a través de un archivo .csv de Excel.
        </p>
      </div>

      <div className="flex border-b border-border text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px flex-1 border-b-2 pb-3 font-medium',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {TABS[t]}
          </button>
        ))}
      </div>

      {tab === 'export' ? <ExportTab /> : tab === 'import' ? <ImportTab /> : <ImagesTab />}

      <p className="inline-flex w-full items-center justify-center gap-1 text-center text-sm text-primary">Más sobre exportar e importar productos <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}

function ExportTab() {
  const { store } = useStore();
  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Solo para mostrar el contador (el export real recorre TODO en el backend).
  const { data } = useQuery({
    queryKey: ['products', store?.id, 'export-count'],
    queryFn: () => api.get<{ items: unknown[]; hasMore: boolean }>('/api/v1/products?limit=100'),
    enabled: !!store,
  });
  const count = data?.items.length ?? 0;
  const countLabel = data?.hasMore ? `${count}+` : `${count}`;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await api.download(`/api/v1/products/export?includeDescriptions=${includeDescriptions}`);
      downloadBlob(`productos-${store?.subdomain ?? 'tienda'}.csv`, blob);
      toast('Archivo exportado', { variant: 'success' });
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : 'No se pudo exportar', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="text-sm font-medium text-fg-muted">Productos a exportar</div>
      <div className="mt-1 text-3xl font-bold text-fg">{countLabel}</div>
      <p className="mt-1 text-xs text-fg-subtle">
        El archivo incluye todas tus variantes y las URLs de las imágenes de cada producto.
      </p>
      <div className="mt-4">
        <Checkbox
          label="Incluir descripciones"
          checked={includeDescriptions}
          onChange={(e) => setIncludeDescriptions(e.target.checked)}
        />
      </div>
      <Button className="mt-5" disabled={count === 0 || busy} onClick={download}>
        {busy ? 'Generando…' : <span className="inline-flex items-center gap-1.5"><Download className="h-4 w-4" /> Exportar</span>}
      </Button>
    </Card>
  );
}

interface ImportJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalProducts: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  imagesImported: number;
  errorCount: number;
  errors: { line: number; slug: string; message: string }[];
  failureMessage: string | null;
}

function ImportTab() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [modifyExisting, setModifyExisting] = useState(true);
  const [updateStock, setUpdateStock] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const { data: job } = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => api.get<ImportJobStatus>(`/api/v1/products/import/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'completed' || s === 'failed' ? false : 800;
    },
  });

  // Al terminar: refrescar el listado de productos y avisar.
  useEffect(() => {
    if (job?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      toast(`Importación lista: +${job.created} nuevos · ${job.updated} actualizados`, { variant: 'success' });
    } else if (job?.status === 'failed') {
      toast(job.failureMessage ?? 'La importación falló', { variant: 'error' });
    }
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (f: File) => {
    setFile(f);
    setJobId(null);
    const text = await f.text();
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const sep = lines[0]?.includes(';') ? ';' : ',';
    const parse = (line: string) => line.split(sep).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
    setPreview({
      headers: parse(lines[0] ?? ''),
      rows: lines.slice(1, 6).map(parse),
    });
  };

  const startImport = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('updateExisting', String(modifyExisting));
      form.append('updateStock', String(updateStock));
      const res = await api.postForm<{ jobId: string; totalProducts: number }>('/api/v1/products/import', form);
      setJobId(res.jobId);
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : 'No se pudo encolar la importación', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setJobId(null);
  };

  const downloadEmpty = () => {
    downloadCsv('plantilla-productos-vacia.csv', buildCsv([CSV_HEADER]));
    toast('Plantilla vacía descargada — completala y subila acá', { variant: 'success' });
  };

  const downloadWithExamples = () => {
    downloadCsv('plantilla-productos-ejemplos.csv', buildCsv([CSV_HEADER, ...TEMPLATE_EXAMPLES]));
    toast('Plantilla con ejemplos descargada', { variant: 'success' });
  };

  const running = job && (job.status === 'queued' || job.status === 'processing');
  const done = job && (job.status === 'completed' || job.status === 'failed');

  return (
    <Card>
      <p className="text-sm text-fg-muted">
        Cargá un archivo de hasta 20000 líneas. Si es necesario, dividilo en más de uno. Podés usar la lista que
        disponibilizamos al "Exportar".
      </p>

      {/* Paso 1: descargar una plantilla para completar */}
      <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4">
        <div className="text-sm font-semibold text-fg">¿No tenés un archivo? Descargá una plantilla</div>
        <p className="mt-0.5 text-xs text-fg-muted">
          Completala con tus productos en Excel o Google Sheets y después subila acá abajo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadEmpty}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Download className="h-4 w-4" /> Plantilla vacía
          </button>
          <button
            type="button"
            onClick={downloadWithExamples}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            <Download className="h-4 w-4" /> Plantilla con ejemplos
          </button>
        </div>
      </div>

      {/* Paso 2: subir el archivo completado */}
      <div className="mt-4 text-sm font-semibold text-fg">Subí tu archivo completado</div>
      <label
        className={cn(
          'mt-2 flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed py-7 transition-colors',
          running
            ? 'cursor-not-allowed border-border bg-bg-subtle text-fg-subtle'
            : 'cursor-pointer border-primary/40 bg-primary/[0.03] text-primary hover:bg-primary/[0.06]',
        )}
      >
        <Plus className="h-6 w-6" />
        <span className="text-sm font-semibold">{file ? file.name : 'Cargar archivo .csv'}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={!!running}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      {preview && !job && (
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-subtle text-left text-fg-muted">
                {preview.headers.slice(0, 6).map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
                {preview.headers.length > 6 && <th className="px-2 py-1.5">…</th>}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border">
                  {r.slice(0, 6).map((c, ci) => (
                    <td key={ci} className="whitespace-nowrap px-2 py-1.5 text-fg-muted">
                      {c}
                    </td>
                  ))}
                  {r.length > 6 && <td className="px-2 py-1.5">…</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border bg-bg-subtle px-2 py-1.5 text-xs text-fg-subtle">
            Vista previa de las primeras filas
          </div>
        </div>
      )}

      {/* Progreso / resultado del job */}
      {job && <ImportProgress job={job} />}

      {!job && (
        <>
          <div className="mt-4 space-y-2">
            <Checkbox label="Modificar productos ya existentes" checked={modifyExisting} onChange={(e) => setModifyExisting(e.target.checked)} />
            <Checkbox label="Actualizar stock" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)} />
          </div>

          <Button className="mt-4" disabled={!file || submitting} onClick={startImport}>
            {submitting ? 'Encolando…' : <span className="inline-flex items-center gap-1.5"><Upload className="h-4 w-4" /> Importar</span>}
          </Button>
        </>
      )}

      {done && (
        <Button variant="secondary" className="mt-4" onClick={reset}>
          Importar otro archivo
        </Button>
      )}
    </Card>
  );
}

function ImportProgress({ job }: { job: ImportJobStatus }) {
  const pct = job.totalProducts > 0 ? Math.round((job.processed / job.totalProducts) * 100) : 0;
  const running = job.status === 'queued' || job.status === 'processing';

  return (
    <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-fg">
          {job.status === 'queued' && 'En cola…'}
          {job.status === 'processing' && 'Importando productos…'}
          {job.status === 'completed' && <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" /> Importación completada</span>}
          {job.status === 'failed' && <span className="inline-flex items-center gap-1.5"><X className="h-4 w-4" /> La importación falló</span>}
        </span>
        <span className="text-fg-muted">
          {job.processed}/{job.totalProducts}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            job.status === 'failed' ? 'bg-danger' : 'bg-primary',
            running && 'animate-pulse',
          )}
          style={{ width: `${job.status === 'completed' ? 100 : pct}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Nuevos" value={job.created} tone="text-success" />
        <Stat label="Actualizados" value={job.updated} tone="text-primary" />
        <Stat label="Omitidos" value={job.skipped} tone="text-fg-muted" />
        <Stat label="Imágenes" value={job.imagesImported} tone="text-fg" />
      </div>

      {job.errorCount > 0 && (
        <details className="mt-3 rounded-md border border-danger/30 bg-danger/[0.04] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-danger">
            {job.errorCount} fila(s) con problemas
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-fg-muted">
            {job.errors.map((e, i) => (
              <li key={i}>
                <span className="font-medium text-fg">Fila {e.line}</span>
                {e.slug && <span className="text-fg-subtle"> ({e.slug})</span>}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {job.failureMessage && <p className="mt-2 text-xs text-danger">{job.failureMessage}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-2">
      <div className={cn('text-lg font-bold', tone)}>{value}</div>
      <div className="text-[0.7rem] text-fg-subtle">{label}</div>
    </div>
  );
}

interface ImageJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalFiles: number;
  processed: number;
  matchedProducts: number;
  imagesAdded: number;
  unmatchedFiles: number;
  unmatchedSample: string[];
  failureMessage: string | null;
}

function ImagesTab() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const { data: job } = useQuery({
    queryKey: ['image-job', jobId],
    queryFn: () => api.get<ImageJobStatus>(`/api/v1/products/images/import/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'completed' || s === 'failed' ? false : 800;
    },
  });

  useEffect(() => {
    if (job?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['products', store?.id] });
      toast(`${job.imagesAdded} imágenes subidas a ${job.matchedProducts} productos`, { variant: 'success' });
    } else if (job?.status === 'failed') {
      toast(job.failureMessage ?? 'La importación de imágenes falló', { variant: 'error' });
    }
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (files.length === 0) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      const res = await api.postForm<{ jobId: string; totalFiles: number }>('/api/v1/products/images/import', form);
      setJobId(res.jobId);
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : 'No se pudo subir', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setJobId(null);
  };

  const running = job && (job.status === 'queued' || job.status === 'processing');
  const done = job && (job.status === 'completed' || job.status === 'failed');
  const pct = job && job.totalFiles > 0 ? Math.round((job.processed / job.totalFiles) * 100) : 0;

  return (
    <Card>
      <p className="text-sm text-fg-muted">
        Subí las imágenes de tus productos (o un <span className="font-medium text-fg">.zip</span>). Se asocian solas a
        cada producto.
      </p>

      <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4 text-xs text-fg-muted">
        <div className="text-sm font-semibold text-fg">¿Cómo se asocian?</div>
        <p className="mt-1">
          El nombre del archivo tiene que coincidir con el <span className="font-medium text-fg">Identificador de URL</span>{' '}
          del producto. Para varias fotos, agregá <span className="font-medium text-fg">-2</span>,{' '}
          <span className="font-medium text-fg">-3</span>, etc.
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-[0.7rem] text-fg-subtle">
          <li>remera-oversize.jpg → producto «remera-oversize» (principal)</li>
          <li>remera-oversize-2.jpg → misma, segunda foto</li>
        </ul>
        <p className="mt-2">Si no encuentra el slug, prueba con el SKU.</p>
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-sm font-semibold text-fg">O subí un CSV de mapeo (asociación exacta)</div>
          <p className="mt-1">
            También podés subir, junto con las imágenes (o el <span className="font-medium text-fg">.zip</span>), un{' '}
            <span className="font-medium text-fg">CSV de mapeo</span> con las columnas{' '}
            <span className="font-medium text-fg">«Identificador de URL»</span> y{' '}
            <span className="font-medium text-fg">«Archivos»</span> (nombres de archivo separados por{' '}
            <span className="font-mono text-fg-subtle">{' | '}</span>). En ese caso la asociación es{' '}
            <span className="font-medium text-fg">exacta</span>, sin adivinar por el nombre del archivo. Recomendado para
            catálogos grandes o cuando los nombres no coinciden con el slug.
          </p>
        </div>
      </div>

      {!job && (
        <>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-primary/40 bg-primary/[0.03] py-7 text-primary transition-colors hover:bg-primary/[0.06]">
            <Plus className="h-6 w-6" />
            <span className="text-sm font-semibold">
              {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : 'Elegí imágenes, un .zip o un CSV de mapeo'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,.zip,.csv"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>

          <Button className="mt-4" disabled={files.length === 0 || submitting} onClick={start}>
            {submitting ? 'Subiendo…' : <span className="inline-flex items-center gap-1.5"><Upload className="h-4 w-4" /> Importar imágenes</span>}
          </Button>
        </>
      )}

      {job && (
        <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-fg">
              {job.status === 'queued' && 'En cola…'}
              {job.status === 'processing' && 'Subiendo imágenes…'}
              {job.status === 'completed' && <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" /> Imágenes importadas</span>}
              {job.status === 'failed' && <span className="inline-flex items-center gap-1.5"><X className="h-4 w-4" /> Falló</span>}
            </span>
            <span className="text-fg-muted">
              {job.processed}/{job.totalFiles}
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                job.status === 'failed' ? 'bg-danger' : 'bg-primary',
                running && 'animate-pulse',
              )}
              style={{ width: `${job.status === 'completed' ? 100 : pct}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Imágenes" value={job.imagesAdded} tone="text-success" />
            <Stat label="Productos" value={job.matchedProducts} tone="text-primary" />
            <Stat label="Sin match" value={job.unmatchedFiles} tone="text-fg-muted" />
          </div>

          {job.unmatchedSample.length > 0 && (
            <details className="mt-3 rounded-md border border-border bg-surface p-3">
              <summary className="cursor-pointer text-sm font-semibold text-fg-muted">
                Archivos sin producto ({job.unmatchedFiles})
              </summary>
              <ul className="mt-2 space-y-0.5 font-mono text-[0.7rem] text-fg-subtle">
                {job.unmatchedSample.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {done && (
        <Button variant="secondary" className="mt-4" onClick={reset}>
          Subir más imágenes
        </Button>
      )}
    </Card>
  );
}
