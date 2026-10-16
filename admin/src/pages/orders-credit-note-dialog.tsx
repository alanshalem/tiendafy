import { useId, useState } from 'react';
import { Button, Modal, Spinner } from '@tiendafy/ui';
import { formatMoney, formatMoneyInput } from '../lib/format';
import { parseMoneyInput } from '../lib/price';

export interface CreditNoteRequest {
  /** En pesos, como lo espera la API. */
  amount: number;
  reason: string | null;
  idempotencyKey: string;
}

/**
 * Emitir una nota de crédito a mano: por lo devuelto sin acreditar o por un
 * ajuste (un precio corregido, un descuento posterior). El monto arranca con
 * lo devuelto sin acreditar y se puede cambiar hasta lo que queda de la
 * factura. La clave del pedido nace con el diálogo: un doble click o un
 * reintento no emiten dos notas de crédito.
 */
export function CreditNoteDialog({
  invoiceLabel,
  currency,
  remaining,
  refundedUncredited,
  busy,
  onClose,
  onConfirm,
}: {
  /** "Factura B 0003-00000042": lo que acredita. */
  invoiceLabel: string;
  currency: string;
  /** Lo que queda por acreditar de la factura, en centavos. */
  remaining: number;
  /** Lo devuelto sin nota de crédito, en centavos (0 = es un ajuste). */
  refundedUncredited: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (req: CreditNoteRequest) => void;
}) {
  const fid = useId();
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(refundedUncredited > 0 ? formatMoneyInput(refundedUncredited) : '');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const cents = parseMoneyInput(amount);
  const valid = Number.isFinite(cents) && cents > 0 && cents <= remaining;
  const dirty =
    reason.trim() !== '' || (refundedUncredited > 0 ? cents !== refundedUncredited : amount !== '');

  const submit = () => onConfirm({ amount: cents / 100, reason: reason.trim() || null, idempotencyKey: key });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title="Emitir nota de crédito"
      footer={
        confirming ? (
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Volver
            </Button>
            <Button variant="danger" onClick={submit} disabled={busy}>
              {busy && <Spinner inline />} Sí, emitir la nota de crédito
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!valid}>
              Continuar
            </Button>
          </>
        )
      }
    >
      {confirming ? (
        <p className="text-sm text-fg">
          Se va a emitir en ARCA una nota de crédito por <strong>{formatMoney(cents, currency)}</strong> que
          acredita la <strong>{invoiceLabel}</strong>. Una vez emitida no se puede anular: si te equivocás,
          hay que corregirla con otro comprobante.
        </p>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Acredita la {invoiceLabel}. Queda por acreditar {formatMoney(remaining, currency)}.
          </p>
          {refundedUncredited === 0 && (
            <p className="mt-2 rounded-md bg-bg-muted px-3 py-2 text-sm text-fg">
              Esta venta no tiene plata devuelta sin nota de crédito: usala para un ajuste (un precio
              corregido, un descuento después de la venta).
            </p>
          )}
          <div className="mt-3">
            <label htmlFor={`${fid}-1`} className="mb-1 block text-sm font-medium text-fg">
              Monto
            </label>
            <input
              id={`${fid}-1`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={`Hasta ${formatMoney(remaining, currency)}`}
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {amount && !valid && (
              <p className="mt-1 text-xs text-danger">
                Ingresá un monto mayor a 0 y hasta {formatMoney(remaining, currency)}.
              </p>
            )}
          </div>
          <div className="mt-3">
            <label htmlFor={`${fid}-2`} className="mb-1 block text-sm font-medium text-fg">
              Motivo (opcional)
            </label>
            <input
              id={`${fid}-2`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="Ej: devolución de un producto, precio corregido…"
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </>
      )}
    </Modal>
  );
}
