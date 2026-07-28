import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react';
import { Button, Input, Select, Switch, Textarea, cn, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { SettingsHeader } from './SettingsLayout';

// ---- Tipos wire --------------------------------------------------------------

type FiscalCondition = 'RESPONSABLEINSCRIPTO' | 'MONOTRIBUTO';
type FiscalEnvironment = 'HOMOLOGACION' | 'PRODUCCION';
type InvoiceTrigger = 'ONPAYMENT' | 'ONFULFILLMENT';
type CertStatus = 'PENDINGCSR' | 'ACTIVE' | 'EXPIRED';

interface CertificateDto {
  id: string;
  status: CertStatus;
  environment: FiscalEnvironment;
  subjectCn: string | null;
  notAfterUtc: string | null;
  usable: boolean;
}

interface FiscalConfigDto {
  configured: boolean;
  cuit: string | null;
  businessName: string | null;
  condition: FiscalCondition | null;
  environment: FiscalEnvironment | null;
  autoInvoice: boolean;
  trigger: InvoiceTrigger | null;
  defaultPointOfSaleId: string | null;
  consumerFinalThresholdMinorUnits: number | null;
  enabled: boolean;
  certificate: CertificateDto | null;
}

interface PointOfSale {
  id: string;
  number: number;
  label: string;
  active: boolean;
}

interface CsrResponse {
  certificateId: string;
  csrPem: string;
  alias: string;
}

// ---- Página ------------------------------------------------------------------

export function FiscalInvoicingPage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const canConfig = can('fiscal.config');
  const { toast } = useToast();

  const [config, setConfig] = useState<FiscalConfigDto | null>(null);
  const [points, setPoints] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, pos] = await Promise.all([
        api.get<FiscalConfigDto>('/api/v1/fiscal/config'),
        api.get<{ items: PointOfSale[] }>('/api/v1/fiscal/points-of-sale').catch(() => ({ items: [] })),
      ]);
      setConfig(cfg);
      setPoints(pos.items ?? []);
    } catch (err) {
      toast(errMsg(err, 'No se pudo cargar la configuración de facturación.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (store && canConfig) load();
    else if (!canConfig) setLoading(false);
  }, [store, canConfig, load]);

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader
        title="Facturación electrónica (ARCA)"
        description="Conectá tu tienda con ARCA para emitir facturas oficiales de tus ventas."
      />

      {!canConfig ? (
        <NoPermission />
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-6 text-sm text-fg-muted shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
        </div>
      ) : (
        <div className="space-y-5">
          <IntroBanner />
          <ProgressChecklist config={config} points={points} />
          <IssuerStep config={config} onSaved={load} />
          <CertificateStep config={config} onChanged={load} />
          <PointsOfSaleStep points={points} configured={!!config?.configured} onChanged={load} />
          <EmissionStep config={config} points={points} onSaved={load} />
        </div>
      )}
    </div>
  );
}

// ---- Sin permiso -------------------------------------------------------------

function NoPermission() {
  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-card">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-muted text-fg-muted">
        <Lock className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-fg">No tenés permiso para la facturación</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
        La configuración fiscal solo la pueden tocar los roles Dueño, Administrador o Finanzas. Si necesitás
        acceso, pedile a un administrador de la tienda que ajuste tu rol.
      </p>
    </div>
  );
}

// ---- Banner explicativo ------------------------------------------------------

function IntroBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-fg">¿Qué es esto y por qué lo necesito?</span>
          <span className="block text-xs text-fg-muted">Facturación electrónica explicada en criollo.</span>
        </span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-fg-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 px-5 pb-5 text-sm leading-relaxed text-fg-muted">
          <p>
            Cuando alguien te compra, la ley te obliga a darle una <strong>factura oficial</strong>. Esa
            factura no se inventa: se la pedís a <strong>ARCA</strong> (el organismo del Estado, antes se
            llamaba AFIP), que la aprueba y le pone un número de autorización (el CAE).
          </p>
          <p>
            La buena noticia: <strong>Tiendafy lo hace solo por vos</strong>. Vos configurás esto una vez, y
            después cada venta se factura sin que muevas un dedo.
          </p>
          <p>
            Y no hay riesgo: primero se practica en modo <strong>Homologación</strong> (facturas de mentira,
            para probar), y recién cuando todo funciona pasás a <strong>Producción</strong> (facturas de
            verdad).
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Checklist de progreso ---------------------------------------------------

function ProgressChecklist({ config, points }: { config: FiscalConfigDto | null; points: PointOfSale[] }) {
  const dataDone = !!config?.configured;
  const cert = config?.certificate;
  const certDone = cert?.status === 'ACTIVE';
  const posDone = points.length > 0;
  const ready = dataDone && certDone && posDone;

  const steps: { label: string; done: boolean; pending?: boolean }[] = [
    { label: 'Datos del emisor', done: dataDone },
    { label: 'Certificado', done: certDone, pending: dataDone && !certDone },
    { label: 'Puntos de venta', done: posDone },
    { label: 'Listo para facturar', done: ready },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                s.done
                  ? 'bg-success text-white'
                  : s.pending
                    ? 'bg-warning text-white'
                    : 'bg-bg-muted text-fg-muted',
              )}
            >
              {s.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn('text-sm font-medium', s.done ? 'text-fg' : 'text-fg-muted')}>{s.label}</span>
            {i < steps.length - 1 && <span className="mx-1 hidden h-px w-6 bg-border sm:block" />}
          </div>
        ))}
      </div>
      {!ready && (
        <p className="mt-3 flex items-start gap-2 text-xs text-fg-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Mientras el certificado no esté activo y no tengas al menos un punto de venta, todavía no se pueden
          emitir facturas.
        </p>
      )}
    </div>
  );
}

// ---- Card genérica -----------------------------------------------------------

function StepCard({
  step,
  title,
  subtitle,
  icon,
  disabled,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface shadow-card', disabled && 'opacity-60')}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-muted">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              Paso {step}
            </span>
            <span className="text-base font-bold text-fg">{title}</span>
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">
        {disabled ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Lock className="h-4 w-4 shrink-0" /> Completá el paso anterior para habilitar esta sección.
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Explicación breve bajo un campo. */
function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-fg-muted">{children}</p>;
}

/** Bloque colapsable de ayuda. */
function Helper({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-fg"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3 text-sm leading-relaxed text-fg-muted">{children}</div>}
    </div>
  );
}

// ---- Paso 1: Datos del emisor ------------------------------------------------

function IssuerStep({ config, onSaved }: { config: FiscalConfigDto | null; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [cuit, setCuit] = useState(config?.cuit ?? '');
  const [businessName, setBusinessName] = useState(config?.businessName ?? '');
  const [condition, setCondition] = useState<FiscalCondition>(config?.condition ?? 'RESPONSABLEINSCRIPTO');
  const [environment, setEnvironment] = useState<FiscalEnvironment>(config?.environment ?? 'HOMOLOGACION');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.put<FiscalConfigDto>('/api/v1/fiscal/config', {
        cuit: cuit.trim(),
        businessName: businessName.trim(),
        condition,
        environment,
      });
      toast('Datos del emisor guardados', { variant: 'success' });
      await onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar los datos.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard
      step={1}
      title="Datos del emisor"
      subtitle="Quién factura: los datos con los que ARCA te identifica."
      icon={<FileText className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">CUIT</label>
          <Input
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            placeholder="20-12345678-6"
            inputMode="numeric"
          />
          <Hint>
            Tu número de identificación fiscal (11 dígitos). Ej: <code>20-12345678-6</code>. Con él ARCA sabe
            quién emite cada factura.
          </Hint>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Razón social</label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Mi Negocio S.R.L."
          />
          <Hint>El nombre legal de tu negocio, tal cual figura en ARCA. Sale impreso en la factura.</Hint>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Condición frente a ARCA</label>
          <Select
            value={condition}
            onChange={(e) => setCondition(e.target.value as FiscalCondition)}
            options={[
              { value: 'RESPONSABLEINSCRIPTO', label: 'Responsable Inscripto' },
              { value: 'MONOTRIBUTO', label: 'Monotributo' },
            ]}
          />
          <Hint>
            Define qué tipo de factura emitís: Responsable Inscripto emite Factura A/B (con IVA); Monotributo
            emite Factura C (más simple, sin desglose de IVA).
          </Hint>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Ambiente</label>
          <Select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as FiscalEnvironment)}
            options={[
              { value: 'HOMOLOGACION', label: 'Homologación (práctica)' },
              { value: 'PRODUCCION', label: 'Producción (real)' },
            ]}
          />
          <Hint>
            Homologación es el modo de práctica: las facturas no valen, sirven para probar sin riesgo.
            Producción emite facturas reales.
          </Hint>
          {environment === 'PRODUCCION' && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg p-2.5 text-xs text-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              Empezá siempre en Homologación. Pasá a Producción recién cuando comprobaste que todo funciona.
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar datos
          </Button>
        </div>
      </div>
    </StepCard>
  );
}

// ---- Paso 2: Certificado -----------------------------------------------------

function CertificateStep({
  config,
  onChanged,
}: {
  config: FiscalConfigDto | null;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const cert = config?.certificate ?? null;
  const configured = !!config?.configured;

  const [csr, setCsr] = useState<CsrResponse | null>(null);
  const [certPem, setCertPem] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activating, setActivating] = useState(false);

  const isActive = cert?.status === 'ACTIVE';
  // El certificate id activo para pegar/activar: el del CSR recién generado o el de un PENDINGCSR guardado.
  const pendingCertId = csr?.certificateId ?? (cert && cert.status === 'PENDINGCSR' ? cert.id : null);
  const showCsrFlow = !isActive;

  // Dispara la descarga del CSR como archivo. Recibe el contenido directo (no del
  // state) para poder llamarse justo después de generarlo sin esperar el re-render.
  const triggerDownload = (pem: string, alias: string) => {
    try {
      const blob = new Blob([pem], { type: 'application/x-pem-file' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${alias || 'tiendafy'}.csr`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await api.post<CsrResponse>('/api/v1/fiscal/certificate/csr', {});
      setCsr(res);
      // Descarga automática apenas se genera (usando res, no el state todavía viejo).
      const downloaded = triggerDownload(res.csrPem, res.alias);
      toast(
        downloaded
          ? 'Solicitud (CSR) generada y descargada. Subila a ARCA.'
          : 'Solicitud (CSR) generada. Descargala con el botón y subila a ARCA.',
        { variant: 'success' },
      );
      await onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo generar la solicitud.'), { variant: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const downloadCsr = () => {
    if (!csr) return;
    triggerDownload(csr.csrPem, csr.alias);
  };

  const copyCsr = async () => {
    if (!csr) return;
    try {
      await navigator.clipboard.writeText(csr.csrPem);
      toast('CSR copiado al portapapeles', { variant: 'success' });
    } catch {
      toast('No se pudo copiar. Copialo manualmente del cuadro.', { variant: 'error' });
    }
  };

  const activate = async () => {
    if (activating) return;
    if (!pendingCertId) {
      toast('Primero generá la solicitud (CSR).', { variant: 'error' });
      return;
    }
    if (certPem.trim().length === 0) {
      toast('Pegá el certificado que te dio ARCA.', { variant: 'error' });
      return;
    }
    setActivating(true);
    try {
      await api.post<CertificateDto>('/api/v1/fiscal/certificate/activate', {
        certificateId: pendingCertId,
        certificatePem: certPem.trim(),
      });
      toast('¡Certificado activado!', { variant: 'success' });
      setCsr(null);
      setCertPem('');
      await onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo activar el certificado.'), { variant: 'error' });
    } finally {
      setActivating(false);
    }
  };

  return (
    <StepCard
      step={2}
      title="Certificado digital"
      subtitle="El “DNI” de tu tienda para hablar con ARCA."
      icon={<ShieldCheck className="h-5 w-5" />}
      disabled={!configured}
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-fg-muted">
          El certificado es como el <strong>documento de identidad de tu tienda</strong> para hablar con ARCA:
          sin él, ARCA no te contesta. Va de la mano de una <strong>clave privada</strong> (su secreto).
          Tiendafy la genera y la guarda <strong>cifrada</strong>: no se muestra por pantalla ni se comparte
          jamás, ni siquiera con ARCA.
        </p>

        {isActive ? (
          <div className="rounded-lg border border-success/30 bg-success-bg p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="text-sm font-bold text-success">Certificado activo</span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {cert?.subjectCn && (
                <div className="flex gap-2">
                  <dt className="text-fg-muted">Titular:</dt>
                  <dd className="font-medium text-fg">{cert.subjectCn}</dd>
                </div>
              )}
              {cert?.notAfterUtc && (
                <div className="flex gap-2">
                  <dt className="text-fg-muted">Vence:</dt>
                  <dd className="font-medium text-fg">
                    {new Date(cert.notAfterUtc).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
              )}
            </dl>
            <Button variant="secondary" className="mt-3" onClick={generate} disabled={generating}>
              {generating && <Loader2 className="h-4 w-4 animate-spin" />} Regenerar certificado
            </Button>
          </div>
        ) : (
          <>
            {!csr && (
              <Button onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generar solicitud (CSR)
              </Button>
            )}

            {csr && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-fg">
                    Tu solicitud de certificado (CSR)
                  </label>
                  <Textarea
                    readOnly
                    rows={5}
                    value={csr.csrPem}
                    className="font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={downloadCsr}>
                      <Download className="h-4 w-4" /> Descargar CSR
                    </Button>
                    <Button variant="secondary" onClick={copyCsr}>
                      <Copy className="h-4 w-4" /> Copiar
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-bg-muted/40 p-4">
                  <p className="mb-2 text-sm font-semibold text-fg">Qué hacer ahora en ARCA</p>
                  <ol className="ml-4 list-decimal space-y-1.5 text-sm text-fg-muted">
                    <li>Entrá a la web de ARCA con tu clave fiscal.</li>
                    <li>
                      Andá a <strong>Administración de Certificados Digitales</strong>.
                    </li>
                    <li>Creá un certificado (o alias) y subí este CSR que acabás de descargar.</li>
                    <li>Descargá el certificado que te devuelve ARCA (archivo .pem o .crt).</li>
                    <li>Volvé acá y pegá su contenido en el cuadro de abajo.</li>
                  </ol>
                  <a
                    href="https://www.afip.gob.ar/ws/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" /> Ir a los web services de ARCA
                  </a>
                  <p className="mt-2 flex items-start gap-2 text-xs text-fg-muted">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    En <strong>Homologación</strong> el sitio es el <strong>WSASS</strong> (el autoservicio de
                    homologación de ARCA), no el portal de producción.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-fg">
                Pegá acá el certificado firmado por ARCA
              </label>
              <Textarea
                rows={5}
                value={certPem}
                onChange={(e) => setCertPem(e.target.value)}
                placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                className="font-mono text-xs"
              />
              <Hint>
                Es el archivo .pem / .crt que descargaste de ARCA. Abrilo con un editor y copiá todo.
              </Hint>
              <Button className="mt-2" onClick={activate} disabled={activating || !pendingCertId}>
                {activating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Activar certificado
              </Button>
            </div>
          </>
        )}

        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-muted/40 p-3 text-xs text-fg-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            Recordá que en ARCA además hay que <strong>delegar el servicio “wsfe”</strong> (factura
            electrónica) a este certificado: es un paso manual en el portal. Te mostramos cómo en el centro de
            ayuda.
          </span>
        </div>

        {showCsrFlow && (
          <Helper title="¿Qué es el CSR y por qué este ida y vuelta?">
            El CSR es un “formulario de pedido” del certificado. Vos no lo fabricás: se lo pedís a ARCA.
            Tiendafy lo arma solo (con tu CUIT y razón social adentro), vos lo subís a la web de ARCA, ARCA te
            devuelve el certificado ya fabricado, y lo pegás de vuelta acá. Es un trámite que se hace una sola
            vez.
          </Helper>
        )}
      </div>
    </StepCard>
  );
}

// ---- Paso 3: Puntos de venta -------------------------------------------------

function PointsOfSaleStep({
  points,
  configured,
  onChanged,
}: {
  points: PointOfSale[];
  configured: boolean;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const add = async () => {
    const n = Number(number.trim());
    if (!Number.isInteger(n) || n <= 0) {
      toast('Ingresá un número de punto de venta válido.', { variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      await api.post<PointOfSale>('/api/v1/fiscal/points-of-sale', { number: n, label: label.trim() });
      toast('Punto de venta agregado', { variant: 'success' });
      setNumber('');
      setLabel('');
      await onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo agregar el punto de venta.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (pos: PointOfSale) => {
    const ok = await confirm({
      title: 'Eliminar punto de venta',
      message: `Vas a eliminar el punto de venta ${pos.number}${pos.label ? ` (${pos.label})` : ''}.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(pos.id);
    try {
      await api.delete(`/api/v1/fiscal/points-of-sale/${pos.id}`);
      toast('Punto de venta eliminado', { variant: 'success' });
      await onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo eliminar el punto de venta.'), { variant: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <StepCard
      step={3}
      title="Puntos de venta"
      subtitle="El “cajón numerado” de tus facturas."
      icon={<Store className="h-5 w-5" />}
      disabled={!configured}
    >
      <p className="text-sm leading-relaxed text-fg-muted">
        Un punto de venta es el cajón numerado de tus comprobantes. Primero lo das de alta en ARCA (te asignan
        un número) y después lo cargás acá. Podés tener varios, por ejemplo uno para tu Web y otro para
        MercadoLibre.
      </p>

      {points.length > 0 && (
        <div className="mt-4 space-y-2">
          {points.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-bg-muted/30 p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-sm font-bold text-fg tabular-nums">
                {p.number}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">
                  {p.label || `Punto de venta ${p.number}`}
                </span>
                <span className="text-xs text-fg-muted">{p.active ? 'Activo' : 'Inactivo'}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={deleting === p.id}
                title="Eliminar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                {deleting === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="w-24">
          <label className="mb-1 block text-sm font-medium text-fg">Número</label>
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="numeric"
            placeholder="1"
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="mb-1 block text-sm font-medium text-fg">Etiqueta (opcional)</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Web" />
        </div>
        <Button onClick={add} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
        </Button>
      </div>
    </StepCard>
  );
}

// ---- Paso 4: Preferencias de emisión -----------------------------------------

function EmissionStep({
  config,
  points,
  onSaved,
}: {
  config: FiscalConfigDto | null;
  points: PointOfSale[];
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [autoInvoice, setAutoInvoice] = useState(config?.autoInvoice ?? false);
  const [trigger, setTrigger] = useState<InvoiceTrigger>(config?.trigger ?? 'ONPAYMENT');
  const [defaultPos, setDefaultPos] = useState(config?.defaultPointOfSaleId ?? '');
  const [busy, setBusy] = useState(false);

  const configured = !!config?.configured;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.put<FiscalConfigDto>('/api/v1/fiscal/config/emission', {
        autoInvoice,
        trigger,
        defaultPointOfSaleId: defaultPos || null,
        consumerFinalThresholdMinorUnits: config?.consumerFinalThresholdMinorUnits ?? null,
      });
      toast('Preferencias de emisión guardadas', { variant: 'success' });
      await onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar las preferencias.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard
      step={4}
      title="Preferencias de emisión"
      subtitle="Opcional: cómo y cuándo se factura cada venta."
      icon={<FileText className="h-5 w-5" />}
      disabled={!configured}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-bg-muted/40 p-3">
          <Switch
            checked={autoInvoice}
            onChange={setAutoInvoice}
            label="Facturar automáticamente cada venta"
            description="Si lo activás, Tiendafy emite la factura sola por cada venta, sin que hagas nada."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg">¿Cuándo se factura?</label>
          <Select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as InvoiceTrigger)}
            disabled={!autoInvoice}
            options={[
              { value: 'ONPAYMENT', label: 'Al acreditarse el pago' },
              { value: 'ONFULFILLMENT', label: 'Al despachar el pedido' },
            ]}
          />
          <Hint>
            “Al acreditarse el pago” factura apenas entra la plata; “Al despachar” espera a que prepares el
            envío.
          </Hint>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Punto de venta por defecto</label>
          <Select
            value={defaultPos}
            onChange={(e) => setDefaultPos(e.target.value)}
            placeholder={points.length ? 'Elegí un punto de venta' : 'Cargá un punto de venta primero'}
            disabled={points.length === 0}
            options={points.map((p) => ({
              value: p.id,
              label: `${p.number}${p.label ? ` · ${p.label}` : ''}`,
            }))}
          />
          <Hint>El cajón numerado con el que se emiten las facturas automáticas.</Hint>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar preferencias
          </Button>
        </div>
      </div>
    </StepCard>
  );
}
