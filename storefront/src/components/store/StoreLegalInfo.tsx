'use client';

import { formatMoney } from '@tiendafy/types';
import { useCart } from './cart';
import { priceWithoutTaxes, useStoreLegal } from '@/lib/store-legal';

/**
 * "Precio sin impuestos nacionales: $X" (Ley 27.743, régimen de
 * transparencia fiscal; Res. SIC 4/2025 para la exhibición): debajo del
 * precio final y con letra menor, como pide la norma. Se calcula con lo que
 * la tienda cargó en Datos legales; si la tienda lo apagó, no ocupa lugar.
 */
export function PriceWithoutTaxes({
  amount,
  currency,
  className = '',
}: {
  /** Precio final en centavos. */
  amount: number;
  currency?: string;
  className?: string;
}) {
  const { tenantId } = useCart();
  const legal = useStoreLegal(tenantId);
  const net = priceWithoutTaxes(legal, amount);
  if (net === null) return null;
  return (
    <p className={`text-[11px] leading-tight text-fg-muted ${className}`}>
      Precio sin impuestos nacionales: {formatMoney(net, currency)}
    </p>
  );
}

/**
 * Quién vende, en el renglón legal del pie: razón social, CUIT, domicilio y
 * el QR de "Data Fiscal" de ARCA (link o imagen, lo que cargó el comercio).
 * Sin nada cargado no muestra nada.
 */
export function SellerIdentity() {
  const { tenantId } = useCart();
  const legal = useStoreLegal(tenantId);
  if (!legal) return null;
  const parts = [legal.legalName, legal.cuit ? `CUIT ${legal.cuit}` : null, legal.address].filter(Boolean);
  const qr = legal.dataFiscalImageUrl;
  const link = legal.dataFiscalUrl;
  if (parts.length === 0 && !qr && !link) return null;

  const qrNode = qr ? (
    <img
      src={qr}
      alt="Data Fiscal (ARCA)"
      width={40}
      height={40}
      className="h-10 w-10 rounded-sm bg-white object-contain"
    />
  ) : (
    <span className="inline-block py-2 underline-offset-2 hover:underline">Data Fiscal</span>
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {parts.length > 0 && <span className="py-2">{parts.join(' · ')}</span>}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Data Fiscal de ARCA (se abre en otra pestaña)"
        >
          {qrNode}
        </a>
      ) : (
        qr && qrNode
      )}
    </span>
  );
}
