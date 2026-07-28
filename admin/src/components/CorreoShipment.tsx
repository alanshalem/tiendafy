import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button, Input, Modal, Select, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';

export const CORREO_PROVINCES: { value: string; label: string }[] = [
  { value: 'B', label: 'Buenos Aires' },
  { value: 'C', label: 'CABA' },
  { value: 'K', label: 'Catamarca' },
  { value: 'H', label: 'Chaco' },
  { value: 'U', label: 'Chubut' },
  { value: 'X', label: 'Córdoba' },
  { value: 'W', label: 'Corrientes' },
  { value: 'E', label: 'Entre Ríos' },
  { value: 'P', label: 'Formosa' },
  { value: 'Y', label: 'Jujuy' },
  { value: 'L', label: 'La Pampa' },
  { value: 'F', label: 'La Rioja' },
  { value: 'M', label: 'Mendoza' },
  { value: 'N', label: 'Misiones' },
  { value: 'Q', label: 'Neuquén' },
  { value: 'R', label: 'Río Negro' },
  { value: 'A', label: 'Salta' },
  { value: 'J', label: 'San Juan' },
  { value: 'D', label: 'San Luis' },
  { value: 'Z', label: 'Santa Cruz' },
  { value: 'S', label: 'Santa Fe' },
  { value: 'G', label: 'Santiago del Estero' },
  { value: 'V', label: 'Tierra del Fuego' },
  { value: 'T', label: 'Tucumán' },
];

interface OrderLike {
  id: string;
  buyerEmail: string;
  buyerName: string | null;
  buyerPhone: string | null;
  shippingMethod: string | null;
  shippingAddress: string | null;
  total: { amount: number; currency: string };
}

/**
 * Alta del envío de una venta en MiCorreo (POST /shipping/import). Precarga
 * los datos del comprador y la dirección parseada BEST-EFFORT — el merchant
 * revisa y corrige antes de confirmar (la dirección de la orden es texto
 * libre; MiCorreo la exige estructurada). Después del alta, el pago del
 * envío y la etiqueta se terminan en la plataforma MiCorreo.
 */
export function CorreoShipmentButton({ order }: { order: OrderLike }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ configured: boolean; active?: boolean }>('/api/v1/admin/shipping/correo')
      .then((c) => alive && setAvailable(c.configured === true))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  if (!available) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-semibold text-fg hover:bg-bg-muted"
      >
        <Send className="h-3.5 w-3.5" /> Crear envío en Correo Argentino
      </button>
      {open && <ShipmentModal order={order} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Av. Corrientes 1234, 2B, CABA, CP 1043" → campos sueltos (mejor esfuerzo). */
function parseAddress(raw: string | null): { street: string; number: string; city: string; cp: string } {
  const out = { street: '', number: '', city: '', cp: '' };
  if (!raw) return out;
  const parts = raw.split(',').map((p) => p.trim());
  const cpPart = parts.find((p) => /^CP\s/i.test(p));
  if (cpPart) out.cp = cpPart.replace(/^CP\s*/i, '');
  const streetPart = parts[0] ?? '';
  const m = streetPart.match(/^(.*?)\s+(\d+[a-zA-Z]?)$/);
  if (m) {
    out.street = m[1] ?? '';
    out.number = m[2] ?? '';
  } else {
    out.street = streetPart;
  }
  const rest = parts.slice(1).filter((p) => !/^CP\s/i.test(p));
  out.city = rest[rest.length - 1] ?? '';
  return out;
}

function ShipmentModal({ order, onClose }: { order: OrderLike; onClose: () => void }) {
  const { toast } = useToast();
  const parsed = parseAddress(order.shippingAddress);
  const isAgencyMethod = /sucursal/i.test(order.shippingMethod ?? '');
  const agencyCodeInAddress = order.shippingAddress?.match(/\(([A-Z]\d{3,5})\)/)?.[1] ?? '';

  const [deliveryType, setDeliveryType] = useState(isAgencyMethod ? 'S' : 'D');
  const [name, setName] = useState(order.buyerName ?? '');
  const [email, setEmail] = useState(order.buyerEmail);
  const [phone, setPhone] = useState(order.buyerPhone ?? '');
  const [street, setStreet] = useState(parsed.street);
  const [number, setNumber] = useState(parsed.number);
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState(parsed.city);
  const [province, setProvince] = useState('B');
  const [cp, setCp] = useState(parsed.cp);
  const [agency, setAgency] = useState(agencyCodeInAddress);
  const [declared, setDeclared] = useState(String(Math.round(order.total.amount / 100)));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; createdAt: string | null }>(
        `/api/v1/admin/orders/${order.id}/correo-shipment`,
        {
          deliveryType,
          recipientName: name.trim(),
          recipientEmail: email.trim(),
          recipientPhone: phone.trim() || null,
          streetName: street.trim() || null,
          streetNumber: number.trim() || null,
          floor: floor.trim() || null,
          apartment: apartment.trim() || null,
          city: city.trim() || null,
          provinceCode: province,
          postalCode: cp.trim() || null,
          agency: agency.trim() || null,
          declaredValue: Number(declared) || 0,
        },
      );
      setDone(res.createdAt ?? 'ok');
      toast('Envío creado en MiCorreo', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo crear el envío en MiCorreo.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const inputLabel = 'mb-1 block text-xs font-medium text-fg';

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Crear envío en Correo Argentino"
      footer={
        done ? (
          <Button onClick={onClose}>Listo</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear envío
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-2 text-sm text-fg">
          <p className="font-semibold text-success">El envío quedó importado en MiCorreo. ✓</p>
          <p className="text-fg-muted">
            Para terminar, entrá a tu cuenta de MiCorreo: ahí pagás el envío, generás la etiqueta y obtenés el
            número de seguimiento. Después cargalo en esta venta con “Marcar enviada”.
          </p>
        </div>
      ) : (
        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-fg-muted">
            Revisá los datos antes de confirmar: la dirección se precarga desde la venta pero puede necesitar
            ajustes (MiCorreo la pide separada en campos).
          </p>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className={inputLabel}>Tipo de entrega</label>
              <Select
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value)}
                options={[
                  { value: 'D', label: 'A domicilio' },
                  { value: 'S', label: 'A sucursal' },
                ]}
              />
            </div>
            <div>
              <label className={inputLabel}>Nombre del destinatario</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={inputLabel}>Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className={inputLabel}>Teléfono</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className={inputLabel}>Valor declarado ($)</label>
              <Input value={declared} onChange={(e) => setDeclared(e.target.value)} inputMode="numeric" />
            </div>
          </div>

          {deliveryType === 'S' ? (
            <div>
              <label className={inputLabel}>Código de sucursal (ej: B0107)</label>
              <Input value={agency} onChange={(e) => setAgency(e.target.value.toUpperCase())} />
              <p className="mt-1 text-xs text-fg-subtle">
                Si el comprador eligió sucursal en el checkout, el código figura en la dirección de la venta.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label className={inputLabel}>Calle</label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} />
              </div>
              <div>
                <label className={inputLabel}>Número</label>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
              <div>
                <label className={inputLabel}>Piso</label>
                <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
              </div>
              <div>
                <label className={inputLabel}>Depto</label>
                <Input value={apartment} onChange={(e) => setApartment(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={inputLabel}>Ciudad</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={inputLabel}>Provincia</label>
                <Select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  options={CORREO_PROVINCES}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={inputLabel}>Código postal</label>
                <Input value={cp} onChange={(e) => setCp(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
