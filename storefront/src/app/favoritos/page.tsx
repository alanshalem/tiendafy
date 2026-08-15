import { StorefrontPageShell } from '@/lib/storefront-page';
import { FavoritesList } from '@/components/store/FavoritesList';

export const dynamic = 'force-dynamic';

export default function FavoritesPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {({ theme }) => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Mis favoritos
          </h1>
          <FavoritesList productList={theme.productList} />
        </main>
      )}
    </StorefrontPageShell>
  );
}
