import { headers } from 'next/headers';
import { PlatformLanding } from '@/components/landing/PlatformLanding';
import { StorefrontView } from '@/components/store/StorefrontView';
import { ComingSoon } from '@/components/store/ComingSoon';
import { fetchDraftTheme, fetchPublishedTheme } from '@/lib/theme';
import { isPlatformHost, loadStorefront, withReferencedProducts } from '@/lib/storefront';
import './landing.css';

/** URL de la plataforma (sin el subdominio de la tienda) para el CTA de registro. */
async function platformUrl(): Promise<string> {
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const parts = host.split('.');
  const base = parts.length > 1 ? parts.slice(1).join('.') : host;
  return `http://${base}`;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<import('next').Metadata> {
  if (await isPlatformHost()) {
    return { title: 'Tiendafy — Abrí tu tienda online', description: 'Catálogo, checkout y cobros con tu propia cuenta de Mercado Pago.' };
  }
  const data = await loadStorefront();
  if (!data) return { title: 'Tienda' };
  const theme = await fetchPublishedTheme(data.tenant.id).catch(() => null);
  return {
    title: data.tenant.name,
    description: `Tienda online de ${data.tenant.name}. Envíos a todo el país.`,
    openGraph: { title: data.tenant.name, images: theme?.shareImage ? [theme.shareImage] : [] },
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ preview?: string; pt?: string }> }) {
  if (await isPlatformHost()) return <PlatformLanding />;

  const data = await loadStorefront();
  if (!data) return <StoreNotFound />;
  if (data.tenant.status === 'CANCELED') return <StoreDeleted registerUrl={await platformUrl()} />;
  if (data.tenant.status === 'SUSPENDED') return <StoreSuspended name={data.tenant.name} />;

  const sp = await searchParams;
  const preview = sp.preview === '1';
  const theme = preview ? await fetchDraftTheme(data.tenant.id, sp.pt) : await fetchPublishedTheme(data.tenant.id);

  if (!preview && theme.comingSoon.enabled) return <ComingSoon theme={theme} tenantName={data.tenant.name} />;

  const products = await withReferencedProducts(data.tenant.id, theme, data.products);

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={products}
      live={preview}
    />
  );
}

function StoreNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Tienda no encontrada</h1>
        <p className="mt-2 text-fg-muted">No hay ninguna tienda registrada en esta dirección.</p>
      </div>
    </main>
  );
}

function StoreDeleted({ registerUrl }: { registerUrl: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-fg/5 text-2xl">🏷️</div>
        <h1 className="text-2xl font-bold">Esta tienda ha sido eliminada</h1>
        <p className="mt-2 text-fg-muted">
          El nombre quedó libre. Si querés reclamarlo, registrate y creá tu tienda.
        </p>
        <a
          href={registerUrl}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-fg hover:opacity-90"
        >
          Registrate y reclamá el nombre
        </a>
      </div>
    </main>
  );
}

function StoreSuspended({ name }: { name: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{name} está temporalmente suspendida</h1>
        <p className="mt-2 text-fg-muted">Volvé a intentar más tarde.</p>
      </div>
    </main>
  );
}
