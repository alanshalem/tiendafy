import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Modal, Select, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { formatMoney } from '../lib/format';
import { VariantPicker } from '../components/VariantPicker';

interface ManualItem {
  variantId: string;
  label: string;
  sku: string;
  quantity: string;
  /** En pesos (se convierte a centavos al enviar). Vacío = precio de lista. */
  price: string;
}

/**
 * Venta manual (WhatsApp / mostrador / teléfono): la única puerta de entrada
 * de una venta era el checkout — esto crea la orden desde el panel, reserva
 * stock de verdad y nace pagada (efectivo o transferencia), con los mismos
 * side-effects que un pago online: kits, email y factura automática.
 */
export function ManualSaleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ManualItem[]>([]);
  const [payment, setPayment] = useState('cash');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const totalMinor = items.reduce((sum, i) => {
    const price = Number(i.price) > 0 ? Math.round(Number(i.price) * 100) : 0;
    return sum + price * (Number(i.quantity) || 0);
  }, 0);
  const hasCustomPrices = items.every((i) => Number(i.price) > 0);

  const create = async () => {
    setBusy(true);
    try {
      await api.post('/api/v1/orders/manual', {
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: Number(i.quantity) || 1,
          unitPriceMinor: Number(i.price) > 0 ? Math.round(Number(i.price) * 100) : null,
        })),
        paymentMethod: payment,
        buyerEmail: buyerEmail.trim() || null,
        buyerName: buyerName.trim() || null,
        buyerPhone: buyerPhone.trim() || null,
        notes: notes.trim() || null,
      });
      toast('Venta registrada: stock descontado y factura en camino (si está configurada).', {
        variant: 'success',
      });
      onCreated();
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo registrar la venta.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva venta manual"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={busy || items.length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Registrar
            venta
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Para ventas por WhatsApp, teléfono o mostrador. Reserva y descuenta stock real, y si la facturación
        automática está activa, emite el comprobante como cualquier venta.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Productos</p>
          <VariantPicker
            placeholder="Buscar producto o SKU para agregar…"
            exclude={new Set(items.map((i) => i.variantId))}
            onPick={(v) =>
              setItems((list) => [
                ...list,
                { variantId: v.variantId, label: v.label, sku: v.sku, quantity: '1', price: '' },
              ])
            }
          />
          {items.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {items.map((item, idx) => (
                <li key={item.variantId} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {item.label} <span className="font-mono text-xs text-fg-subtle">{item.sku}</span>
                  </span>
                  <div className="w-16 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      className="h-8 text-right"
                      value={item.quantity}
                      onChange={(e) =>
                        setItems((l) => l.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="$ lista"
                      className="h-8 text-right"
                      value={item.price}
                      onChange={(e) =>
                        setItems((l) => l.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="text-fg-subtle hover:text-danger"
                    onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <p className="mt-1.5 text-right text-sm font-semibold text-fg">
              {hasCustomPrices
                ? `Total: ${formatMoney(totalMinor)}`
                : 'Los precios vacíos usan el precio de lista.'}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">Cliente</label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nombre" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">Email (opcional)</label>
            <Input
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="Para el email de confirmación"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">Teléfono (opcional)</label>
            <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+54 9…" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">Cobro</label>
            <Select
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              options={[
                { value: 'cash', label: 'Efectivo' },
                { value: 'transfer', label: 'Transferencia' },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">Notas (opcional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: vendido por Instagram, retira el sábado"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
