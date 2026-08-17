import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { resolveTenant } from '@/lib/tenancy';
import { apiGetTenant } from '@/lib/api';
import { CmsBody } from '@/components/store/CmsBody';
import { REVALIDATE } from '@/lib/cache';

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenant();
  if (!tenant) return {};
  // apiGetTenant: el tenant también en la URL, o la Data Cache mezcla tiendas.
  const page = await apiGetTenant<PageDto>(`/api/v1/pages/by-slug/${slug}`, tenant.id, {
    next: { revalidate: REVALIDATE.cms },
  });
  if (!page) return {};
  return { title: page.title, description: page.title };
}

export default async function InstitutionalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {async ({ data }) => {
        const page = await apiGetTenant<PageDto>(`/api/v1/pages/by-slug/${slug}`, data.tenant.id, {
          next: { revalidate: REVALIDATE.cms },
        });
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
