import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Upload, X } from 'lucide-react';
import { Button, Card, cn, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg, UploadAbortedError } from '../../lib/api';
import { sizeLabel } from '../../lib/uploads';
import { FileDropzone, UploadBar, UploadNotes, useUploadQueue } from '../../components/upload/primitives';
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
  // Avance del envío (de 0 a 1) mientras viajan los archivos; null si no se está mandando nada.
  const [sending, setSending] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Solo para revisar cada archivo al elegirlo: el envío es uno solo, con todos.
  const check = useUploadQueue('bulkImages', async () => undefined);
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
    abort.current = new AbortController();
    setSending(0);
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      const res = await api.postForm<{ jobId: string; totalFiles: number }>(
        '/api/v1/products/images/import',
        form,
        { onProgress: setSending, signal: abort.current.signal },
      );
      setJobId(res.jobId);
    } catch (e) {
      if (!(e instanceof UploadAbortedError)) toast(errMsg(e, 'No se pudo subir'), { variant: 'error' });
    } finally {
      setSending(null);
    }
  };

  // Se suman a los ya elegidos (se puede arrastrar de a tandas); el mismo nombre no se repite.
  const addFiles = (picked: File[]) => {
    const ok = check.screen(picked);
    setFiles((current) => [...current.filter((f) => !ok.some((n) => n.name === f.name)), ...ok]);
  };

  const reset = () => {
    setFiles([]);
    setJobId(null);
    check.dismissNotes();
  };

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

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
          <FileDropzone
            kind="bulkImages"
            multiple
            disabled={sending !== null}
            label={files.length > 0 ? 'Agregar más archivos' : 'Elegí imágenes, un .zip o un CSV de mapeo'}
            onFiles={addFiles}
            className="mt-4 py-7"
          />

          {files.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-fg">
                {files.length === 1 ? '1 archivo elegido' : `${files.length} archivos elegidos`} ·{' '}
                <span className="text-fg-muted">{sizeLabel(totalBytes)}</span>
              </span>
              {sending === null && (
                <button type="button" onClick={reset} className="text-xs text-fg-muted hover:underline">
                  Vaciar
                </button>
              )}
            </div>
          )}
          <div className="mt-2">
            <UploadNotes notes={check.notes} onDismiss={check.dismissNotes} />
          </div>

          {sending !== null ? (
            <UploadBar
              className="mt-4"
              name={files.length === 1 ? files[0]!.name : `${files.length} archivos`}
              fraction={sending}
              onCancel={() => abort.current?.abort()}
              doneLabel="Encolando…"
            />
          ) : (
            <Button className="mt-4" disabled={files.length === 0} onClick={start}>
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-4 w-4" /> Importar imágenes
              </span>
            </Button>
          )}
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
