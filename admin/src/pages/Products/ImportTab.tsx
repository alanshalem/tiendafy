import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Plus, Upload, X } from 'lucide-react';
import { Button, Card, Checkbox, cn, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { BOM, buildCsv, CSV_HEADER, downloadCsv, TEMPLATE_EXAMPLES } from './export-import-shared';

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

export function ImportTab() {
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
      toast(`Importación lista: +${job.created} nuevos · ${job.updated} actualizados`, {
        variant: 'success',
      });
    } else if (job?.status === 'failed') {
      toast(job.failureMessage ?? 'La importación falló', { variant: 'error' });
    }
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (f: File) => {
    setFile(f);
    setJobId(null);
    const text = await f.text();
    const lines = text.replace(BOM, '').split(/\r?\n/).filter(Boolean);
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
      const res = await api.postForm<{ jobId: string; totalProducts: number }>(
        '/api/v1/products/import',
        form,
      );
      setJobId(res.jobId);
    } catch (e) {
      toast(errMsg(e, 'No se pudo encolar la importación'), {
        variant: 'error',
      });
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
        Cargá un archivo de hasta 20000 líneas. Si es necesario, dividilo en más de uno. Podés usar la lista
        que disponibilizamos al "Exportar".
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
            <Checkbox
              label="Modificar productos ya existentes"
              checked={modifyExisting}
              onChange={(e) => setModifyExisting(e.target.checked)}
            />
            <Checkbox
              label="Actualizar stock"
              checked={updateStock}
              onChange={(e) => setUpdateStock(e.target.checked)}
            />
          </div>

          <Button className="mt-4" disabled={!file || submitting} onClick={startImport}>
            {submitting ? (
              'Encolando…'
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-4 w-4" /> Importar
              </span>
            )}
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
          {job.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Importación completada
            </span>
          )}
          {job.status === 'failed' && (
            <span className="inline-flex items-center gap-1.5">
              <X className="h-4 w-4" /> La importación falló
            </span>
          )}
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

export function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-2">
      <div className={cn('text-lg font-bold', tone)}>{value}</div>
      <div className="text-[0.7rem] text-fg-subtle">{label}</div>
    </div>
  );
}
