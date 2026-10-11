import { StorefrontView } from '@/components/store/StorefrontView';
import { ComingSoon } from '@/components/store/ComingSoon';
import { fetchDraftTheme, fetchPublishedTheme } from '@/lib/theme';
import { loadStorefront, siteBase, withReferencedProducts } from '@/lib/storefront';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<import('next').Metadata> {
  // Todo host es el de una tienda, el dominio raíz incluido: la importadora
  // que opera la instalación vende desde ahí. Un host que no resuelve a
  // ninguna tienda es un error de configuración, no otra cosa que mostrar.
  const data = await loadStorefront();
  if (!data) return { title: 'Tienda no encontrada' };
  const theme = await fetchPublishedTheme(data.tenant.id).catch(() => null);
  // El merchant define su título/descripción SEO en el editor (Identidad);
  // sin eso, un default con la marca — nunca el nombre pelado compitiendo
  // con el mismo texto que todas las demás tiendas.
  const title = theme?.seoTitle?.trim() || `${data.tenant.name} — Tienda online`;
  const description =
    theme?.seoDescription?.trim() ||
    `Comprá online en ${data.tenant.name}. Envíos a todo el país y pago seguro.`;
  const base = await siteBase();
  return {
    title,
    description,
    ...(base ? { alternates: { canonical: `${base}/` } } : {}),
    openGraph: { title, description, images: theme?.shareImage ? [theme.shareImage] : [] },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; pt?: string }>;
}) {
  const data = await loadStorefront();
  if (!data) return <StoreNotFound />;
  if (data.tenant.status === 'CANCELED') return <StoreDeleted />;
  if (data.tenant.status === 'SUSPENDED') return <StoreSuspended name={data.tenant.name} />;

  const sp = await searchParams;
  const preview = sp.preview === '1';
  const theme = preview
    ? await fetchDraftTheme(data.tenant.id, sp.pt)
    : await fetchPublishedTheme(data.tenant.id);

  if (!preview && theme.comingSoon.enabled)
    return <ComingSoon theme={theme} tenantName={data.tenant.name} tenantId={data.tenant.id} />;

  const products = await withReferencedProducts(data.tenant.id, theme, data.products);

  // Organization + WebSite: nombre, logo y redes de la tienda para el Knowledge
  // Panel / resultados de marca. Datos que el merchant ya cargó en el theme.
  const base = await siteBase();
  const sameAs = [theme.footer.instagram, theme.footer.facebook].filter(Boolean);
  const orgJsonLd = base
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            name: data.tenant.name,
            url: `${base}/`,
            ...(theme.logo ? { logo: theme.logo } : {}),
            ...(sameAs.length ? { sameAs } : {}),
          },
          { '@type': 'WebSite', name: data.tenant.name, url: `${base}/` },
        ],
      }
    : null;

  return (
    <>
      {orgJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      )}
      <StorefrontView
        tenantId={data.tenant.id}
        tenantName={data.tenant.name}
        theme={theme}
        products={products}
        live={preview}
      />
    </>
  );
}

/** Pantalla de estado a viewport completo (tienda no encontrada / eliminada / suspendida). */
function StatusScreen({ wide, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className={wide ? 'max-w-md text-center' : 'text-center'}>{children}</div>
    </main>
  );
}

function StoreNotFound() {
  return (
    <StatusScreen>
      <h1 className="text-2xl font-bold">Tienda no encontrada</h1>
      <p className="mt-2 text-fg-muted">No hay ninguna tienda registrada en esta dirección.</p>
    </StatusScreen>
  );
}

function StoreDeleted() {
  // Sin CTA de registro: acá las tiendas las abre el grupo desde el panel, no
  // se registra cualquiera. Invitar a reclamar el nombre no tendría a dónde ir.
  return (
    <StatusScreen wide>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-fg/5 text-2xl">
        🏷️
      </div>
      <h1 className="text-2xl font-bold">Esta tienda ya no está disponible</h1>
      <p className="mt-2 text-fg-muted">La dirección quedó sin una tienda detrás.</p>
    </StatusScreen>
  );
}

function StoreSuspended({ name }: { name: string }) {
  return (
    <StatusScreen>
      <h1 className="text-2xl font-bold">{name} está temporalmente suspendida</h1>
      <p className="mt-2 text-fg-muted">Volvé a intentar más tarde.</p>
    </StatusScreen>
  );
}
