import { StorefrontView } from '@/components/store/StorefrontView';
import { ContactContent } from '@/components/store/ContactContent';
import { resolveStorefrontPage } from '@/lib/storefront-page';

export const dynamic = 'force-dynamic';

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const page = await resolveStorefrontPage(searchParams);
  if (!page.ok) return page.fallback;
  const { data, theme, preview } = page;

  return (
    <StorefrontView tenantId={data.tenant.id} tenantName={data.tenant.name} theme={theme} products={data.products} live={preview}>
      <ContactContent contact={theme.contact} />
    </StorefrontView>
  );
}
