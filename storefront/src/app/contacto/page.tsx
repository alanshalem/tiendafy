import { StorefrontPageShell } from '@/lib/storefront-page';
import { ContactContent } from '@/components/store/ContactContent';

export const dynamic = 'force-dynamic';

export default function ContactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {({ theme }) => <ContactContent contact={theme.contact} />}
    </StorefrontPageShell>
  );
}
