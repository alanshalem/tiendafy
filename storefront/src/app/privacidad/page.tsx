import type { Metadata } from 'next';
import { LegalPage } from '@/components/store/LegalPage';
import { defaultPrivacy } from '@/lib/legal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Política de privacidad' };

export default function PrivacidadPage({ searchParams }: { searchParams: Promise<{ preview?: string; pt?: string }> }) {
  return <LegalPage searchParams={searchParams} slugs={['privacidad', 'politica-de-privacidad']} fallback={defaultPrivacy} />;
}
