import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { resolveTenant } from '@/lib/tenancy';
import { siteBase } from '@/lib/storefront';
import { apiGetTenant } from '@/lib/api';
import { CmsBody } from '@/components/store/CmsBody';
import { REVALIDATE } from '@/lib/cache';
import { describeHtml } from '@/lib/describe';

export const dynamic = 'force-dynamic';

interface PageDto {
  id: string;
  title: string;
  slug: string;
  body: string;
  published: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

// apiGetTenant: el tenant también en la URL, o la Data Cache mezcla tiendas.
// Misma URL en la metadata y en la página: Next la pide una vez.
const fetchPage = (slug: string, tenantId: string) =>
  apiGetTenant<PageDto>(`/api/v1/pages/by-slug/${slug}`, tenantId, {
    next: { revalidate: REVALIDATE.cms },
  });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenant();
  if (!tenant) return {};
  const page = await fetchPage(slug, tenant.id).catch(() => null);
  if (!page) return { title: 'Página no encontrada' };
  const base = await siteBase();
  return {
    title: page.title,
    description: describeHtml(page.body) || page.title,
    ...(base ? { alternates: { canonical: `${base}/paginas/${page.slug}` } } : {}),
  };
}

export default async function InstitutionalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;

  // Una página que no existe (borrada, slug viejo) es un 404 de verdad: Google
  // la saca del índice y la pantalla de 404 busca si el comercio dejó una
  // redirección. Se resuelve antes de empezar a mandar la página, que después
  // el status ya salió. Un 5xx de la API tira (pantalla de error), no es 404.
  const tenant = await resolveTenant();
  if (tenant && !(await fetchPage(slug, tenant.id))) notFound();

  return (
    <StorefrontPageShell searchParams={searchParams}>
      {async ({ data }) => {
        const page = await fetchPage(slug, data.tenant.id);
        return (
          <main className="mx-auto max-w-container px-4 py-10">
            {page ? (
              <CmsBody title={page.title} html={page.body} />
            ) : (
              <>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  Página no encontrada
                </h1>
                <p className="mt-4 opacity-70">La página que buscás no existe o no está disponible.</p>
              </>
            )}
          </main>
        );
      }}
    </StorefrontPageShell>
  );
}
