import type { Metadata } from 'next';
import { LegalPage } from '@/components/store/LegalPage';
import { defaultTerms } from '@/lib/legal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Términos y condiciones' };

export default function TerminosPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; pt?: string }>;
}) {
  return (
    <LegalPage
      searchParams={searchParams}
      slugs={['terminos', 'terminos-y-condiciones']}
      fallback={defaultTerms}
    />
  );
}
