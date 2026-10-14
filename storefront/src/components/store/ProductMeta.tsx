import type { MoneyDto } from '@tiendafy/types';

/**
 * Las etiquetas de Open Graph propias de un producto: og:type=product, el
 * precio, la moneda y si hay stock. Las leen WhatsApp, Facebook/Instagram y
 * Pinterest al compartir el link (Pinterest arma su "pin de producto" con
 * esto). La metadata de Next no tiene el tipo "product" ni las etiquetas
 * product:*, así que van como <meta property> sueltos: React los sube al
 * <head>. Tiene que montarse fuera del Suspense de la ficha, para salir en el
 * <head> del HTML y no recién cuando llega el resto.
 */
export function ProductMeta({
  product,
}: {
  product: { variants: { price: MoneyDto }[]; stock: number | null };
}) {
  const prices = product.variants.map((v) => v.price);
  if (prices.length === 0) return null;
  const lowest = prices.reduce((min, p) => (p.amount < min.amount ? p : min));
  const amount = (lowest.amount / 100).toFixed(2);
  const availability = product.stock === 0 ? 'out of stock' : 'in stock';
  return (
    <>
      <meta property="og:type" content="product" />
      <meta property="product:price:amount" content={amount} />
      <meta property="product:price:currency" content={lowest.currency} />
      <meta property="product:availability" content={availability} />
      <meta property="og:price:amount" content={amount} />
      <meta property="og:price:currency" content={lowest.currency} />
    </>
  );
}
