import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, PackageCheck, ScanLine, X } from 'lucide-react';
import { Badge, Button, Card, Input, Tabs, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';
import { NoStoreSelected } from '../../components/NoStoreSelected';

interface CodeHit {
  productId: string;
  productName: string;
  imageUrl: string | null;
  variantId: string;
  sku: string;
  barcode: string | null;
  description: string;
  priceAmount: number;
  available: number;
  reserved: number;
  location: string | null;
}

interface OrderLite {
  id: string;
  status: string;
  buyerEmail: string;
  fulfilledAtUtc: string | null;
  createdAtUtc: string;
  items: {
    variantId: string;
    productName: string;
    variantDescription: string;
    sku: string;
    quantity: number;
  }[];
}

/**
 * Cámara + BarcodeDetector del navegador (QR, EAN-13/8, Code128, UPC). Sin
 * soporte (Safari viejo, sin cámara): el input manual hace exactamente lo
 * mismo — el flujo nunca depende del hardware.
 */
export function useScanner(onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);
  const [supported] = useState(() => 'BarcodeDetector' in window);
  const stopRef = useRef<() => void>(() => {});
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const stop = useCallback(() => {
    stopRef.current();
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported || !videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const detector = new (window as any).BarcodeDetector({
        formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a'],
      });
      const timer = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue as string | undefined;
          if (!raw) return;
          // Anti-rebote: el mismo código no dispara dos veces en 2,5 s.
          const now = Date.now();
          if (raw === lastRef.current.code && now - lastRef.current.at < 2500) return;
          lastRef.current = { code: raw, at: now };
          onCode(raw);
        } catch {
          /* frame no decodificable: seguir */
        }
      }, 350);
      stopRef.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      };
      setActive(true);
    } catch {
      setActive(false);
    }
  }, [supported, onCode]);

  useEffect(() => () => stopRef.current(), []);

  return { videoRef, active, supported, start, stop };
}

export function CameraBox({ scanner }: { scanner: ReturnType<typeof useScanner> }) {
  return (
    <div className="space-y-2">
      <video
        ref={scanner.videoRef}
        className={`w-full rounded-md border border-border bg-black ${scanner.active ? 'aspect-video' : 'hidden'}`}
        muted
        playsInline
      />
      {scanner.supported ? (
        <Button variant="secondary" onClick={scanner.active ? scanner.stop : scanner.start}>
          <Camera className="h-4 w-4" /> {scanner.active ? 'Apagar cámara' : 'Escanear con la cámara'}
        </Button>
      ) : (
        <p className="text-xs text-fg-muted">
          Este navegador no lee códigos con la cámara (probá Chrome en el celular). El campo manual hace lo
          mismo.
        </p>
      )}
    </div>
  );
}

export function ScannerPage() {
  const { store } = useStore();
  const [tab, setTab] = useState('buscar');

  if (!store) return <NoStoreSelected />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Escáner</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          El depósito en el celular: buscá por código, prepará pedidos sin errores de despacho y contá stock
          escaneando.
        </p>
      </div>

      <Tabs
        items={[
          { id: 'buscar', label: 'Buscar y ajustar' },
          { id: 'picking', label: 'Preparar pedido' },
          { id: 'conteo', label: 'Conteo' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'buscar' && <BuscarTab />}
      {tab === 'picking' && <PickingTab />}
      {tab === 'conteo' && <ConteoTab />}
      <HelpLink id="escaner" />
    </div>
  );
}

// ------------------------------------------------------------ Buscar/ajustar

function BuscarTab() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [manual, setManual] = useState('');
  const [hit, setHit] = useState<CodeHit | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [assignSku, setAssignSku] = useState('');
  const [stockDraft, setStockDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState('');

  const lookup = useCallback(
    async (code: string) => {
      try {
        const found = await api.get<CodeHit>(`/api/v1/products/by-code/${encodeURIComponent(code)}`);
        setHit(found);
        setNotFoundCode(null);
        setStockDraft(String(found.available));
        setLocationDraft(found.location ?? '');
      } catch {
        setHit(null);
        setNotFoundCode(code);
      }
    },
    [setHit],
  );

  const scanner = useScanner(lookup);

  const saveStock = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/inventory/${hit!.variantId}`, {
        available: Number(stockDraft),
        reason: 'Ajuste desde el escáner',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      toast('Stock actualizado', { variant: 'success' });
      if (hit) setHit({ ...hit, available: Number(stockDraft) });
    },
    onError: (e) => toast(errMsg(e, 'Error guardando stock'), { variant: 'error' }),
  });

  const saveLocation = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/inventory/${hit!.variantId}/location`, { location: locationDraft || null }),
    onSuccess: () => {
      toast('Ubicación guardada', { variant: 'success' });
      if (hit) setHit({ ...hit, location: locationDraft || null });
    },
    onError: (e) => toast(errMsg(e, 'Error guardando la ubicación'), { variant: 'error' }),
  });

  const assign = useMutation({
    mutationFn: async () => {
      const target = await api.get<CodeHit>(
        `/api/v1/products/by-code/${encodeURIComponent(assignSku.trim())}`,
      );
      await api.put(`/api/v1/products/${target.productId}/variants/${target.variantId}/barcode`, {
        barcode: notFoundCode,
      });
      return target;
    },
    onSuccess: (target) => {
      toast(`Código asignado a ${target.sku}`, { variant: 'success' });
      setNotFoundCode(null);
      setAssignSku('');
      lookup(target.sku);
    },
    onError: (e) => toast(errMsg(e, 'No se encontró ese SKU'), { variant: 'error' }),
  });

  return (
    <Card>
      <CameraBox scanner={scanner} />
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) lookup(manual.trim());
        }}
      >
        <Input
          placeholder="Código de barras o SKU…"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          <ScanLine className="h-4 w-4" /> Buscar
        </Button>
      </form>

      {notFoundCode && (
        <div className="mt-4 rounded-md border border-border bg-bg-subtle p-4 text-sm">
          <p className="text-fg">
            Ningún producto tiene el código <span className="font-mono">{notFoundCode}</span>.
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            ¿Es el EAN del paquete? Asignáselo a una variante buscándola por SKU:
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="SKU de la variante"
              className="h-9"
              value={assignSku}
              onChange={(e) => setAssignSku(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!assignSku.trim() || assign.isPending}
              onClick={() => assign.mutate()}
            >
              Asignar código
            </Button>
          </div>
        </div>
      )}

      {hit && (
        <div className="mt-4 flex gap-4">
          {hit.imageUrl && (
            <img
              src={hit.imageUrl}
              alt=""
              className="h-24 w-24 rounded-md border border-border object-cover"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div>
              <div className="font-semibold text-fg">{hit.productName}</div>
              <div className="text-fg-muted">
                {hit.description} · <span className="font-mono">{hit.sku}</span> ·{' '}
                {formatMoney(hit.priceAmount)}
              </div>
              {hit.reserved > 0 && <Badge variant="warning">{hit.reserved} reservadas</Badge>}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Stock disponible</label>
                <Input
                  type="number"
                  min={0}
                  className="h-9 w-24 text-right"
                  value={stockDraft}
                  onChange={(e) => setStockDraft(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={saveStock.isPending || Number(stockDraft) === hit.available}
                onClick={() => saveStock.mutate()}
              >
                Guardar stock
              </Button>
              <div className="w-32">
                <label className="mb-1 block text-xs text-fg-muted">Ubicación (ej. B3)</label>
                <Input value={locationDraft} onChange={(e) => setLocationDraft(e.target.value)} />
              </div>
              <Button
                variant="secondary"
                disabled={saveLocation.isPending || (hit.location ?? '') === locationDraft}
                onClick={() => saveLocation.mutate()}
              >
                Guardar ubicación
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------ Picking

function PickingTab() {
  const { store } = useStore();
  const { toast } = useToast();
  const [orderId, setOrderId] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});

  const { data: orders } = useQuery({
    queryKey: ['orders-picking', store?.id],
    queryFn: () => api.get<{ items: OrderLite[] }>('/api/v1/orders?limit=50'),
    enabled: !!store,
  });

  const pending = (orders?.items ?? []).filter((o) => o.status === 'PAID' && !o.fulfilledAtUtc);
  const order = pending.find((o) => o.id === orderId) ?? null;

  const onCode = useCallback(
    async (code: string) => {
      if (!order) return;
      try {
        const found = await api.get<CodeHit>(`/api/v1/products/by-code/${encodeURIComponent(code)}`);
        const item = order.items.find((i) => i.variantId === found.variantId);
        if (!item) {
          toast(`⚠ ${found.productName} NO va en este pedido`, { variant: 'error' });
          return;
        }
        setPicked((p) => {
          const current = p[item.variantId] ?? 0;
          if (current >= item.quantity) {
            toast(`Ya juntaste las ${item.quantity} de ${item.productName}`, { variant: 'error' });
            return p;
          }
          return { ...p, [item.variantId]: current + 1 };
        });
      } catch {
        toast('Código desconocido', { variant: 'error' });
      }
    },
    [order, toast],
  );

  const scanner = useScanner(onCode);
  const complete = order && order.items.every((i) => (picked[i.variantId] ?? 0) >= i.quantity);

  return (
    <Card>
      <p className="text-sm text-fg-muted">
        Elegí un pedido pagado y escaneá cada producto al empaquetarlo: si agarrás el equivocado, suena la
        alarma antes de despachar.
      </p>
      <select
        className="mt-2 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg"
        value={orderId}
        onChange={(e) => {
          setOrderId(e.target.value);
          setPicked({});
        }}
      >
        <option value="">Pedidos pagados sin despachar ({pending.length})…</option>
        {pending.map((o) => (
          <option key={o.id} value={o.id}>
            #{o.id.slice(0, 8)} · {o.buyerEmail} · {o.items.reduce((s, i) => s + i.quantity, 0)} u
          </option>
        ))}
      </select>

      {order && (
        <>
          <div className="mt-3">
            <CameraBox scanner={scanner} />
          </div>
          <ManualPickInput onCode={onCode} />
          <ul className="mt-3 space-y-1.5">
            {order.items.map((i) => {
              const got = picked[i.variantId] ?? 0;
              const done = got >= i.quantity;
              return (
                <li
                  key={i.variantId}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    done ? 'border-success/40 bg-success/10' : 'border-border'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {i.productName}
                    {i.variantDescription && <span className="text-fg-muted"> · {i.variantDescription}</span>}
                    <span className="ml-1 font-mono text-xs text-fg-subtle">{i.sku}</span>
                  </span>
                  <span className={`ml-3 tabular-nums ${done ? 'text-success' : 'text-fg'}`}>
                    {done && <Check className="mr-1 inline h-4 w-4" />}
                    {got}/{i.quantity}
                  </span>
                </li>
              );
            })}
          </ul>
          {complete && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
              <PackageCheck className="h-4 w-4" /> Pedido completo y verificado — marcalo como enviado desde
              Ventas.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function ManualPickInput({ onCode }: { onCode: (code: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onCode(value.trim());
          setValue('');
        }
      }}
    >
      <Input
        placeholder="…o ingresá el código a mano"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" variant="secondary">
        OK
      </Button>
    </form>
  );
}

// ------------------------------------------------------------ Conteo

interface CountRow {
  hit: CodeHit;
  counted: number;
}

function ConteoTab() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, CountRow>>({});

  const onCode = useCallback(
    async (code: string) => {
      try {
        const found = await api.get<CodeHit>(`/api/v1/products/by-code/${encodeURIComponent(code)}`);
        setRows((r) => ({
          ...r,
          [found.variantId]: { hit: found, counted: (r[found.variantId]?.counted ?? 0) + 1 },
        }));
      } catch {
        toast('Código desconocido', { variant: 'error' });
      }
    },
    [toast],
  );

  const scanner = useScanner(onCode);
  const list = Object.values(rows);
  const withDiff = list.filter((r) => r.counted !== r.hit.available);

  const apply = useMutation({
    mutationFn: async () => {
      for (const r of withDiff)
        await api.put(`/api/v1/inventory/${r.hit.variantId}`, {
          available: r.counted,
          reason: 'Conteo cíclico (escáner)',
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      toast(`Conteo aplicado: ${withDiff.length} ajuste(s)`, { variant: 'success' });
      setRows({});
    },
    onError: (e) => toast(errMsg(e, 'Error aplicando el conteo'), { variant: 'error' }),
  });

  return (
    <Card>
      <p className="text-sm text-fg-muted">
        Recorré una estantería escaneando cada unidad (o cargá la cantidad a mano). Al final, un click ajusta
        el sistema a lo contado — sin frenar la operación.
      </p>
      <div className="mt-2">
        <CameraBox scanner={scanner} />
      </div>
      <ManualPickInput onCode={onCode} />

      {list.length > 0 && (
        <>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 text-right font-medium">Sistema</th>
                <th className="py-2 text-right font-medium">Contado</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.hit.variantId} className="border-b border-border last:border-b-0">
                  <td className="py-2 text-fg">
                    {r.hit.productName}
                    <span className="text-fg-muted"> · {r.hit.description}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-fg-muted">{r.hit.available}</td>
                  <td className="py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20 text-right"
                        value={String(r.counted)}
                        onChange={(e) =>
                          setRows((rows) => ({
                            ...rows,
                            [r.hit.variantId]: { ...r, counted: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                      {r.counted !== r.hit.available && <X className="h-4 w-4 text-danger" />}
                      {r.counted === r.hit.available && <Check className="h-4 w-4 text-success" />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-fg-muted">{withDiff.length} diferencia(s) contra el sistema.</span>
            <Button disabled={withDiff.length === 0 || apply.isPending} onClick={() => apply.mutate()}>
              Aplicar ajustes
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
