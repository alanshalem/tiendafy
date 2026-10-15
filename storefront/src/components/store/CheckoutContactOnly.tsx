import { MessageCircle } from 'lucide-react';
import type { CartLine } from './cart';
import type { CheckoutContact } from './CheckoutClient';

/**
 * El checkout de una tienda sin ningún medio de pago: no hay compra online,
 * pero sí venta. Lo que queda es escribirle a la tienda, con el carrito ya
 * contado.
 */
export function CheckoutContactOnly({ lines, contact }: { lines: CartLine[]; contact?: CheckoutContact }) {
  const order = lines.map((l) => `${l.quantity} × ${l.productName}`).join(', ');
  const whatsapp = contact?.whatsapp?.replace(/\D/g, '');
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="mb-2 text-xl font-bold">Comprá escribiéndonos</h1>
      <p className="opacity-70">Esta tienda todavía no tiene los pagos habilitados.</p>
      <p className="mt-1 text-sm text-fg-muted">Mandanos tu pedido y coordinamos el pago y la entrega.</p>
      <div className="mt-5 flex flex-col items-center gap-2">
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`¡Hola! Quiero comprar: ${order}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
          >
            <MessageCircle className="h-4 w-4" /> Comprar por WhatsApp
          </a>
        )}
        {contact?.email && (
          <a
            href={`mailto:${contact.email}?subject=${encodeURIComponent('Quiero comprar')}&body=${encodeURIComponent(order)}`}
            className="text-sm text-primary-ink underline"
          >
            Escribir a {contact.email}
          </a>
        )}
        <a href="/contacto" className="text-sm text-primary-ink underline">
          Ir a Contacto
        </a>
        <a href="/" className="text-sm text-fg-muted underline">
          Volver
        </a>
      </div>
    </main>
  );
}
