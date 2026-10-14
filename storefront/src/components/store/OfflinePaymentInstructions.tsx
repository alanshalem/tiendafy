'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatMoney, type MoneyDto } from '@tiendafy/types';
import { API_URL as API, tenantHeaders } from '@/lib/api-client';

/** Lo que responde GET /orders/{id}/payment-instructions (ver OfflinePaymentService.InstructionsDto). */
interface Instructions {
  method: 'transfer' | 'cash';
  status: string;
  total: MoneyDto;
  discount: MoneyDto;
  dueAtUtc: string | null;
  transfer: {
    bankName: string | null;
    accountHolder: string | null;
    holderTaxId: string | null;
    cbu: string | null;
    alias: string | null;
  } | null;
  instructions: string | null;
  pickupAddress: string | null;
}

/** El plazo en la hora de Argentina, como lo dice el email. */
function formatDue(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}

/**
 * Cómo pagar un pedido por transferencia o en efectivo: cuánto, a qué cuenta
 * (con botón para copiar el CBU y el alias) y hasta cuándo. Lo pide al
 * servidor y no lo trae del checkout, así funciona igual al recargar la
 * pantalla o al volver desde el email. Para cualquier otra orden no muestra
 * nada (el endpoint responde 404).
 */
export function OfflinePaymentInstructions({ tenantId, orderId }: { tenantId: string; orderId: string }) {
  const [data, setData] = useState<Instructions | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/v1/orders/${orderId}/payment-instructions`, { headers: tenantHeaders(tenantId) })
      .then((r) => (r.ok ? (r.json() as Promise<Instructions>) : null))
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [orderId, tenantId]);

  if (!data || data.status !== 'PENDINGPAYMENT') return null;
  const t = data.transfer;

  return (
    <section
      aria-labelledby="como-pagar"
      className="w-full max-w-md rounded-lg border border-fg/15 p-4 text-left text-sm"
    >
      <h2 id="como-pagar" className="text-base font-bold">
        {data.method === 'cash' ? 'Pagás al retirar' : 'Datos para transferir'}
      </h2>
      <p className="mt-1">
        Total a pagar:{' '}
        <strong className="tabular-nums">{formatMoney(data.total.amount, data.total.currency)}</strong>
        {data.discount.amount > 0 && (
          <span className="text-success">
            {' '}
            (ya con {formatMoney(data.discount.amount, data.discount.currency)} de descuento)
          </span>
        )}
      </p>
      {data.method === 'cash' && data.pickupAddress && <p className="mt-1">Dónde: {data.pickupAddress}</p>}
      {t && (
        <dl className="mt-3 space-y-1.5">
          {t.accountHolder && <Row label="Titular" value={t.accountHolder} />}
          {t.holderTaxId && <Row label="CUIT" value={t.holderTaxId} />}
          {t.bankName && <Row label="Banco" value={t.bankName} />}
          {t.cbu && <Row label="CBU/CVU" value={t.cbu} copy />}
          {t.alias && <Row label="Alias" value={t.alias} copy />}
        </dl>
      )}
      {data.dueAtUtc && (
        <p className="mt-3 text-xs text-fg-muted">
          Te guardamos los productos hasta el {formatDue(data.dueAtUtc)}. Si para entonces no registramos el
          pago, el pedido se cancela solo.
        </p>
      )}
      {data.instructions && <p className="mt-2 whitespace-pre-line">{data.instructions}</p>}
    </section>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-semibold">
        <span className="break-all">{value}</span>
        {copy && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(value).then(() => setCopied(true));
            }}
            aria-label={`Copiar ${label}`}
            className="-m-1.5 inline-flex p-1.5 text-fg-muted hover:text-fg"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        )}
      </dd>
    </div>
  );
}
