import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Modal, Select, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { replaceAt } from '../lib/arrays';
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
  // Solo para la venta en cuenta corriente: sin ficha de cliente no hay a quién
  // anotarle la deuda, así que el backend la rechaza.
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  const totalMinor = items.reduce((sum, i) => {
    const price = Number(i.price) > 0 ? Math.round(Number(i.price) * 100) : 0;
    return sum + price * (Number(i.quantity) || 0);
  }, 0);
  const hasCustomPrices = items.every((i) => Number(i.price) > 0);

  const create = async () => {
    if (payment === 'link' && !buyerEmail.trim()) {
      toast('Para cobrar con link de Mercado Pago hace falta el email del comprador.', {
        variant: 'error',
      });
      return;
    }
    if (payment === 'cuenta_corriente' && !customer) {
      toast('Para vender en cuenta corriente elegí un cliente de la agenda.', { variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ paymentLink?: string }>('/api/v1/orders/manual', {
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: Number(i.quantity) || 1,
          unitPriceMinor: Number(i.price) > 0 ? Math.round(Number(i.price) * 100) : null,
        })),
        paymentMethod: payment,
        customerId: customer?.id ?? null,
        returnUrl: window.location.origin,
        buyerEmail: buyerEmail.trim() || null,
        buyerName: customer?.name ?? (buyerName.trim() || null),
        buyerPhone: buyerPhone.trim() || null,
        notes: notes.trim() || null,
      });
      onCreated();
      if (res.paymentLink) {
        // Link de MP: la venta queda PENDIENTE hasta que el cliente pague
        // (el webhook la cobra sola). Se muestra para copiar y mandar.
        setPaymentLink(res.paymentLink);
        toast('Venta creada: mandá el link para cobrarla.', { variant: 'success' });
      } else {
        toast('Venta registrada: stock descontado y factura en camino (si está configurada).', {
          variant: 'success',
        });
        onClose();
      }
    } catch (err) {
      toast(errMsg(err, 'No se pudo registrar la venta.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (paymentLink) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Link de pago listo"
        size="md"
        footer={<Button onClick={onClose}>Listo</Button>}
      >
        <p className="text-sm text-fg-muted">
          Mandale este link al comprador (WhatsApp, mail, donde sea). La venta queda como{' '}
          <span className="font-medium text-fg">pendiente de pago</span> y se marca pagada sola cuando Mercado
          Pago confirme el cobro — con factura y emails automáticos como cualquier venta.
        </p>
        <div className="mt-3 flex gap-2">
          <div className="min-w-0 flex-1">
            <Input readOnly value={paymentLink} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              navigator.clipboard?.writeText(paymentLink);
              toast('Link copiado', { variant: 'success' });
            }}
          >
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          El stock ya quedó reservado para esta venta: si el pago no llega, cancelá la orden desde Ventas para
          liberarlo.
        </p>
      </Modal>
    );
  }

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
                      compact
                      type="number"
                      min={1}
                      className="text-right"
                      value={item.quantity}
                      onChange={(e) => setItems((l) => replaceAt(l, idx, { quantity: e.target.value }))}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <Input
                      compact
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="$ lista"
                      className="text-right"
                      value={item.price}
                      onChange={(e) => setItems((l) => replaceAt(l, idx, { price: e.target.value }))}
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
            <label className="mb-1 block text-sm font-medium text-fg">
              Email {payment === 'link' ? '(requerido)' : '(opcional)'}
            </label>
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
                { value: 'link', label: 'Link de pago (Mercado Pago)' },
                { value: 'cuenta_corriente', label: 'Cuenta corriente (queda debiendo)' },
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

        {payment === 'cuenta_corriente' && (
          <CurrentAccountPicker
            customer={customer}
            search={customerSearch}
            onSearch={setCustomerSearch}
            onPick={setCustomer}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * A quién se le anota la deuda. Es el único dato extra que pide vender en
 * cuenta corriente, y no puede ser texto libre: el saldo se acumula por ficha,
 * así que "Juan" escrito dos veces distinto serían dos deudores.
 */
function CurrentAccountPicker({
  customer,
  search,
  onSearch,
  onPick,
}: {
  customer: { id: string; name: string } | null;
  search: string;
  onSearch: (value: string) => void;
  onPick: (customer: { id: string; name: string } | null) => void;
}) {
  const debounced = useDebouncedValue(search, 300).trim();

  const { data } = useQuery({
    queryKey: ['manual-sale-customers', debounced],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; email: string | null }[] }>(
        `/api/v1/customers?limit=10&q=${encodeURIComponent(debounced)}`,
      ),
    enabled: !customer,
  });

  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <p className="mb-2 text-sm text-fg-muted">
        La venta se registra sin cobrar: el total queda como deuda del cliente en Cuentas corrientes, y se
        salda cuando registres el cobro.
      </p>

      {customer ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span className="font-medium">{customer.name}</span>
          <Button size="sm" variant="ghost" onClick={() => onPick(null)}>
            Cambiar
          </Button>
        </div>
      ) : (
        <>
          <label className="mb-1 block text-sm font-medium text-fg">Cliente de la agenda</label>
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
          />
          {(data?.items ?? []).length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
              {data!.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPick({ id: c.id, name: c.name })}
                  className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-bg-muted"
                >
                  <span>{c.name}</span>
                  {c.email && <span className="text-xs text-fg-subtle">{c.email}</span>}
                </button>
              ))}
            </div>
          )}
          {debounced && (data?.items ?? []).length === 0 && (
            <p className="mt-2 text-sm text-fg-muted">
              No hay ningún cliente con ese nombre. Crealo primero en Clientes.
            </p>
          )}
        </>
      )}
    </div>
  );
}
