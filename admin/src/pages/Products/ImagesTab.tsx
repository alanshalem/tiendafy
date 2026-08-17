import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Upload, X } from 'lucide-react';
import { Button, Card, cn, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { pollWhileRunning } from './queries';
import { Stat } from './ImportTab';

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

export function ImagesTab() {
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
    refetchInterval: pollWhileRunning,
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
      const res = await api.postForm<{ jobId: string; totalFiles: number }>(
        '/api/v1/products/images/import',
        form,
      );
      setJobId(res.jobId);
    } catch (e) {
      toast(errMsg(e, 'No se pudo subir'), { variant: 'error' });
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
        Subí las imágenes de tus productos (o un <span className="font-medium text-fg">.zip</span>). Se
        asocian solas a cada producto.
      </p>

      <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4 text-xs text-fg-muted">
        <div className="text-sm font-semibold text-fg">¿Cómo se asocian?</div>
        <p className="mt-1">
          El nombre del archivo tiene que coincidir con el{' '}
          <span className="font-medium text-fg">Identificador de URL</span> del producto. Para varias fotos,
          agregá <span className="font-medium text-fg">-2</span>,{' '}
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
            También podés subir, junto con las imágenes (o el{' '}
            <span className="font-medium text-fg">.zip</span>), un{' '}
            <span className="font-medium text-fg">CSV de mapeo</span> con las columnas{' '}
            <span className="font-medium text-fg">«Identificador de URL»</span> y{' '}
            <span className="font-medium text-fg">«Archivos»</span> (nombres de archivo separados por{' '}
            <span className="font-mono text-fg-subtle">{' | '}</span>). En ese caso la asociación es{' '}
            <span className="font-medium text-fg">exacta</span>, sin adivinar por el nombre del archivo.
            Recomendado para catálogos grandes o cuando los nombres no coinciden con el slug.
          </p>
        </div>
      </div>

      {!job && (
        <>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-primary/40 bg-primary/[0.03] py-7 text-primary transition-colors hover:bg-primary/[0.06]">
            <Plus className="h-6 w-6" />
            <span className="text-sm font-semibold">
              {files.length > 0
                ? `${files.length} archivo(s) seleccionado(s)`
                : 'Elegí imágenes, un .zip o un CSV de mapeo'}
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
            {submitting ? (
              'Subiendo…'
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-4 w-4" /> Importar imágenes
              </span>
            )}
          </Button>
        </>
      )}

      {job && (
        <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-fg">
              {job.status === 'queued' && 'En cola…'}
              {job.status === 'processing' && 'Subiendo imágenes…'}
              {job.status === 'completed' && (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Imágenes importadas
                </span>
              )}
              {job.status === 'failed' && (
                <span className="inline-flex items-center gap-1.5">
                  <X className="h-4 w-4" /> Falló
                </span>
              )}
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
