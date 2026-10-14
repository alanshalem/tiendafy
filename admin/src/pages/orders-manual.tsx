import { useState, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, Plus, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import { Button, Input, Modal, Select, useToast, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { replaceAt } from '../lib/arrays';
import { formatMoney } from '../lib/format';
import { Z_ANCHORED } from '../lib/styles';
import { usePermissions } from '../context/PermissionsContext';
import { VariantPicker } from '../components/VariantPicker';
import { useBeforeUnload, useGuardedClose } from '../lib/useUnsavedChanges';

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
  const fid = useId();
  const { toast } = useToast();
  const [items, setItems] = useState<ManualItem[]>([]);
  const [payment, setPayment] = useState('cash');
  // El cliente es UN solo campo: lo que se escribe es el nombre de esta venta
  // y, si se elige de la agenda (o se crea ahí), además trae su ficha —
  // obligatoria para la cuenta corriente, y la que dice su lista de precios.
  // Antes eran dos campos ("Cliente" y "Cliente de la agenda") y no se sabía
  // cuál mandaba.
  const [buyerName, setBuyerName] = useState('');
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; paymentLink: string } | null>(null);

  // Una venta a medio cargar (productos, comprador, notas) no se pierde por un
  // click afuera del modal o un Escape de más.
  const dirty =
    items.length > 0 ||
    payment !== 'cash' ||
    !!customer ||
    [buyerName, buyerEmail, buyerPhone, notes].some((v) => v.trim() !== '');
  const cancel = useGuardedClose(dirty && !created, onClose);
  useBeforeUnload(dirty && !created);

  const totalMinor = items.reduce((sum, i) => {
    const price = Number(i.price) > 0 ? Math.round(Number(i.price) * 100) : 0;
    return sum + price * (Number(i.quantity) || 0);
  }, 0);
  const hasCustomPrices = items.every((i) => Number(i.price) > 0);

  const pickCustomer = (c: PickedCustomer | null) => {
    setCustomer(c);
    if (!c) return;
    setBuyerName(c.name);
    // Lo que ya está en la ficha no se vuelve a tipear (sin pisar lo escrito).
    if (c.email && !buyerEmail.trim()) setBuyerEmail(c.email);
    if (c.phone && !buyerPhone.trim()) setBuyerPhone(c.phone);
  };

  const create = async () => {
    if (payment === 'link' && !buyerEmail.trim()) {
      toast('Para cobrar con link de Mercado Pago hace falta el email del comprador.', {
        variant: 'error',
      });
      return;
    }
    if (payment === 'cuenta_corriente' && !customer) {
      toast(
        'Para vender en cuenta corriente elegí un cliente de la agenda (o crealo desde el campo Cliente).',
        {
          variant: 'error',
        },
      );
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ id: string; paymentLink?: string }>('/api/v1/orders/manual', {
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
        setCreated({ id: res.id, paymentLink: res.paymentLink });
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

  if (created) {
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
            <Input
              aria-label="Link de pago"
              readOnly
              value={created.paymentLink}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              navigator.clipboard?.writeText(created.paymentLink);
              toast('Link copiado', { variant: 'success' });
            }}
          >
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          El stock ya quedó reservado para esta venta. Si el pago no llega, abrí la venta y tocá{' '}
          <span className="font-medium text-fg">Cancelar venta</span>: se anula el link y se libera el stock.{' '}
          {created.id && (
            <Link
              to={`/ventas?order=${created.id}`}
              onClick={onClose}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Ver la venta <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title="Nueva venta manual"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={busy || items.length === 0}>
            {busy ? <Spinner inline /> : <Plus className="h-4 w-4" />} Registrar venta
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
                      aria-label={`Cantidad de ${item.label}`}
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
                      aria-label={`Precio de ${item.label}`}
                      className="text-right"
                      value={item.price}
                      onChange={(e) => setItems((l) => replaceAt(l, idx, { price: e.target.value }))}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Quitar ${item.label}`}
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
                : customer?.priceListName
                  ? `Los precios vacíos usan la lista ${customer.priceListName}.`
                  : 'Los precios vacíos usan el precio del producto.'}
            </p>
          )}
        </div>

        <CustomerField
          name={buyerName}
          customer={customer}
          required={payment === 'cuenta_corriente'}
          contact={{ email: buyerEmail, phone: buyerPhone }}
          onName={(text) => {
            setBuyerName(text);
            // Escribir otra cosa suelta la ficha elegida: el nombre y la ficha
            // tienen que decir lo mismo.
            if (customer && text !== customer.name) setCustomer(null);
          }}
          onPick={pickCustomer}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-2`} className="mb-1 block text-sm font-medium text-fg">
              Email {payment === 'link' ? '(requerido)' : '(opcional)'}
            </label>
            <Input
              id={`${fid}-2`}
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="Para el email de confirmación"
            />
          </div>
          <div>
            <label htmlFor={`${fid}-3`} className="mb-1 block text-sm font-medium text-fg">
              Teléfono (opcional)
            </label>
            <Input
              id={`${fid}-3`}
              aria-label="Teléfono (opcional)"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="+54 9…"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-4`} className="mb-1 block text-sm font-medium text-fg">
              Cobro
            </label>
            <Select
              id={`${fid}-4`}
              aria-label="Cobro"
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
            <label htmlFor={`${fid}-5`} className="mb-1 block text-sm font-medium text-fg">
              Notas (opcional)
            </label>
            <Input
              id={`${fid}-5`}
              aria-label="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: vendido por Instagram, retira el sábado"
            />
          </div>
        </div>
        {payment === 'cuenta_corriente' && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            La venta se registra sin cobrar: el total queda como deuda del cliente en Cuentas corrientes, y se
            salda cuando registres el cobro. Necesita un cliente de la agenda.
          </p>
        )}
      </div>
    </Modal>
  );
}

interface PickedCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  priceListName: string | null;
}

interface AgendaCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  priceListId: string | null;
}

/**
 * El cliente de la venta, en un solo campo: se escribe el nombre y abajo
 * aparecen los de la agenda que coinciden; elegir uno trae su ficha (lista de
 * precios, email, teléfono) y, si no está, "Crear en la agenda" lo da de alta
 * en el momento. Sin elegir nada, el nombre queda solo en esta venta.
 *
 * La ficha importa: el saldo de la cuenta corriente y la lista de precios se
 * buscan por ficha, y "Juan" escrito dos veces distinto serían dos clientes.
 */
function CustomerField({
  name,
  customer,
  required,
  contact,
  onName,
  onPick,
}: {
  name: string;
  customer: PickedCustomer | null;
  required: boolean;
  contact: { email: string; phone: string };
  onName: (text: string) => void;
  onPick: (customer: PickedCustomer | null) => void;
}) {
  const fid = useId();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(name, 300).trim();

  const { data } = useQuery({
    queryKey: ['manual-sale-customers', debounced],
    queryFn: () =>
      api.get<{ items: AgendaCustomer[] }>(`/api/v1/customers?limit=8&q=${encodeURIComponent(debounced)}`),
    enabled: !customer && debounced.length >= 2 && can('customers.read'),
  });

  // Solo para mostrar de qué lista salen los precios: el que los aplica es el
  // backend, con la lista guardada en la ficha.
  const { data: lists } = useQuery({
    queryKey: ['price-lists-picker'],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/api/v1/price-lists'),
  });
  const nameOfList = (id: string | null) =>
    id ? ((lists?.items ?? []).find((l) => l.id === id)?.name ?? null) : null;

  const toPicked = (c: AgendaCustomer): PickedCustomer => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    priceListName: nameOfList(c.priceListId),
  });

  const matches = customer ? [] : (data?.items ?? []);
  const exact = matches.some((c) => c.name.trim().toLowerCase() === debounced.toLowerCase());
  const canCreate = can('customers.write') && !customer && debounced.length >= 2 && !exact;
  const showList = open && !customer && (matches.length > 0 || canCreate);

  const createInAgenda = async () => {
    setCreating(true);
    try {
      const c = await api.post<AgendaCustomer>('/api/v1/customers', {
        name: name.trim(),
        email: contact.email.trim() || null,
        phone: contact.phone.trim() || null,
        address: null,
        notes: null,
      });
      onPick(toPicked(c));
      setOpen(false);
      toast(`${c.name} quedó en la agenda de clientes.`, { variant: 'success' });
    } catch (e) {
      toast(errMsg(e, 'No se pudo crear el cliente.'), { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={`${fid}-name`} className="mb-1 block text-sm font-medium text-fg">
        Cliente {required ? '(de la agenda, requerido)' : '(opcional)'}
      </label>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          id={`${fid}-name`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? `${fid}-list` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className="pl-8 pr-9"
          value={name}
          onChange={(e) => {
            onName(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            // Escape cierra la lista, no el modal de la venta.
            if (e.key === 'Escape' && showList) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder="Nombre, o buscá en la agenda…"
        />
        {customer && (
          <button
            type="button"
            aria-label="Quitar el cliente de la agenda"
            onClick={() => {
              onPick(null);
              onName('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={`${fid}-list`}
          role="listbox"
          aria-label="Clientes de la agenda"
          className={`absolute ${Z_ANCHORED} mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-card`}
        >
          {matches.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                // mousedown: que el blur del campo no cierre la lista antes del click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(toPicked(c));
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-bg-muted"
              >
                <span className="truncate text-fg">{c.name}</span>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {nameOfList(c.priceListId) ?? c.email ?? ''}
                </span>
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={createInAgenda}
                disabled={creating}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-bg-muted disabled:opacity-50"
              >
                {creating ? <Spinner inline /> : <UserPlus className="h-4 w-4" />}
                Crear «{name.trim()}» en la agenda
              </button>
            </li>
          )}
        </ul>
      )}
      <p className="mt-1 text-xs text-fg-subtle">
        {customer
          ? `Cliente de la agenda${customer.priceListName ? ` · precios de la lista ${customer.priceListName}` : ''}.`
          : 'Si no lo elegís de la agenda, el nombre queda solo en esta venta.'}
      </p>
    </div>
  );
}
