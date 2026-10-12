import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Modal, Select, useToast } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { formatNumber } from '../lib/format';
import { CameraBox, useScanner } from './Products/Scanner';
import type { PoDetail } from './compras-tipos';

/**
 * Recibir la mercaderia y elegir el proveedor.
 *
 * Es el momento en que la orden deja de ser un papel y toca el stock: lo que
 * se cuenta aca entra al deposito con su costo. Por eso esta separado del
 * editor, que hasta el ultimo segundo sigue siendo una intencion.
 */

export function ReceiveButton({ po, onDone }: { po: PoDetail; onDone: () => void }) {
  const { store } = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [rate, setRate] = useState(String(po.exchangeRate));

  const onScan = useCallback(
    async (code: string) => {
      try {
        const found = await api.get<{ variantId: string }>(
          `/api/v1/products/by-code/${encodeURIComponent(code)}`,
        );
        const item = po.items.find((i) => i.variantId === found.variantId);
        if (!item) {
          toast('Ese producto no está en esta compra', { variant: 'error' });
          return;
        }
        setQtys((q) => {
          const current = Number(q[item.variantId] ?? 0);
          if (current >= item.quantity) return q;
          return { ...q, [item.variantId]: String(current + 1) };
        });
      } catch {
        toast('Código desconocido', { variant: 'error' });
      }
    },
    [po.items, toast],
  );
  const scanner = useScanner(onScan);

  const [lowMargin, setLowMargin] = useState<
    { variantId: string; product: string; variant: string; marginPct: number }[] | null
  >(null);

  const receive = useMutation({
    mutationFn: () =>
      api.post<{
        lowMargin: { variantId: string; product: string; variant: string; marginPct: number }[];
      }>(`/api/v1/purchasing/purchase-orders/${po.id}/receive`, {
        exchangeRate: Number(rate) > 0 ? Number(rate) : null,
        items: po.items.map((i) => ({
          variantId: i.variantId,
          receivedQuantity: qtys[i.variantId] !== undefined ? Number(qtys[i.variantId]) : i.quantity,
        })),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', store?.id] });
      queryClient.invalidateQueries({ queryKey: ['variant-costs', store?.id] });
      toast('Compra recibida: stock actualizado y costos fijados al landed cost', { variant: 'success' });
      setOpen(false);
      // Loop costo→precio: si el landed nuevo aplastó márgenes, se avisa ACÁ
      // (no cuando al merchant se le ocurra entrar a Costos).
      if (res.lowMargin.length > 0) setLowMargin(res.lowMargin);
      else onDone();
    },
    onError: (e) => toast(errMsg(e, 'No se pudo recibir la compra'), { variant: 'error' }),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Recibir</Button>
      {lowMargin && (
        <Modal
          open
          onClose={() => {
            setLowMargin(null);
            onDone();
          }}
          title="⚠ Márgenes aplastados por el costo nuevo"
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setLowMargin(null);
                  onDone();
                }}
              >
                Después
              </Button>
              <Button onClick={() => navigate('/productos/costos')}>Revisar precios en Costos</Button>
            </>
          }
        >
          <p className="text-sm text-fg-muted">
            Con el landed cost de esta recepción, {lowMargin.length}{' '}
            {lowMargin.length === 1 ? 'variante quedó' : 'variantes quedaron'} con margen menor al 15% al
            precio actual — estás vendiendo casi al costo (o debajo).
          </p>
          <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-sm">
            {lowMargin.map((m) => (
              <li key={m.variantId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-fg">
                  {m.product}
                  {m.variant && <span className="text-fg-muted"> · {m.variant}</span>}
                </span>
                <span
                  className={`shrink-0 tabular-nums font-semibold ${m.marginPct < 0 ? 'text-danger' : 'text-warning'}`}
                >
                  {formatNumber(m.marginPct)}%
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Recibir mercadería"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Volver
              </Button>
              <Button onClick={() => receive.mutate()} loading={receive.isPending}>
                Confirmar recepción
              </Button>
            </>
          }
        >
          <div>
            <p className="text-sm text-fg-muted">
              Confirmá lo que llegó: el stock sube y el costo de cada variante queda fijado al landed cost con
              el tipo de cambio definitivo.
            </p>
            <label className="mt-3 block text-sm font-medium text-fg">{`Tipo de cambio definitivo (ARS por ${po.currency})`}</label>
            <Input
              aria-label={`Tipo de cambio definitivo (ARS por ${po.currency})`}
              type="number"
              min={0}
              step="0.01"
              className="mt-1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <div className="mt-3">
              <CameraBox scanner={scanner} />
              <p className="mt-1 text-xs text-fg-muted">
                Escaneá lo que baja del contenedor: el contador de cada ítem sube solo (arranca en lo pedido —
                corregí a mano lo que falte).
              </p>
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {po.items.map((i) => (
                <div key={i.variantId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {i.productName}
                    {i.variantDescription && <span className="text-fg-muted"> · {i.variantDescription}</span>}
                  </span>
                  <span className="text-xs text-fg-subtle">pedidas {i.quantity}</span>
                  <div className="w-20 shrink-0">
                    <Input
                      aria-label={`Recibidas de ${i.productName}`}
                      compact
                      type="number"
                      min={0}
                      max={i.quantity}
                      className="text-right"
                      value={qtys[i.variantId] ?? String(i.quantity)}
                      onChange={(e) => setQtys((q) => ({ ...q, [i.variantId]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Proveedor

/**
 * El proveedor de la OC: se elige de la lista, y ahí la compra queda atada a
 * su ficha y su cuenta corriente. Sigue aceptando texto libre —las compras
 * viejas se cargaron así y no hay por qué obligar a dar de alta a alguien a
 * quien se le compra una sola vez—, pero sin ficha no hay saldo que actualizar
 * cuando se cargue la factura.
 */
export function SupplierField({
  supplierId,
  supplierName,
  disabled,
  onChange,
}: {
  supplierId: string;
  supplierName: string;
  disabled: boolean;
  onChange: (supplierId: string, supplierName: string) => void;
}) {
  const { store } = useStore();

  const { data } = useQuery({
    queryKey: ['suppliers-picker', store?.id],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/api/v1/suppliers'),
    enabled: !!store,
  });

  const suppliers = data?.items ?? [];
  // Un proveedor inactivo o borrado de la lista no puede desaparecer de una OC
  // que ya lo tenía: se agrega al desplegable con el nombre guardado.
  const known = suppliers.some((s) => s.id === supplierId);
  const options = [
    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
    ...(supplierId && !known ? [{ value: supplierId, label: supplierName }] : []),
    {
      value: '',
      label: supplierName && !supplierId ? `${supplierName} (sin ficha)` : 'Sin ficha de proveedor',
    },
  ];

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fg">Proveedor</label>
      {suppliers.length === 0 && !supplierId ? (
        <Input
          aria-label="Proveedor"
          value={supplierName}
          disabled={disabled}
          onChange={(e) => onChange('', e.target.value)}
        />
      ) : (
        <Select
          aria-label="Proveedor"
          value={supplierId}
          disabled={disabled}
          options={options}
          onChange={(e) => {
            const id = e.target.value;
            onChange(id, suppliers.find((s) => s.id === id)?.name ?? supplierName);
          }}
        />
      )}
      {!supplierId && suppliers.length > 0 && (
        <p className="mt-1 text-xs text-fg-subtle">
          Sin ficha, la factura de esta compra no va a impactar en la cuenta corriente.
        </p>
      )}
    </div>
  );
}
