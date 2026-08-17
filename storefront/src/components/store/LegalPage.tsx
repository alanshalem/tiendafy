import { StorefrontPageShell } from '@/lib/storefront-page';
import { apiGetTenant } from '@/lib/api';
import type { LegalDoc } from '@/lib/legal';
import { CmsBody } from './CmsBody';

interface PageDto {
  title: string;
  body: string;
}

/**
 * Página legal con override: si el merchant creó una página CMS con alguno de
 * los `slugs`, se muestra ESA; si no, cae a la plantilla por defecto (`fallback`)
 * completada con el nombre de la tienda. Así toda tienda tiene Términos y
 * Privacidad desde el día uno sin trabajo del merchant.
 */
export function LegalPage({
  searchParams,
  slugs,
  fallback,
}: {
  searchParams: Promise<{ preview?: string; pt?: string }>;
  slugs: string[];
  fallback: (storeName: string) => LegalDoc;
}) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {async ({ data }) => {
        let custom: PageDto | null = null;
        for (const slug of slugs) {
          // apiGetTenant y no apiGet: con revalidate, la Data Cache de Next cachea
          // por URL e ignora headers — sin el tenant en la URL, dos tiendas
          // compartían la entrada de caché de /terminos y /privacidad.
          custom = await apiGetTenant<PageDto>(`/api/v1/pages/by-slug/${slug}`, data.tenant.id, {
            next: { revalidate: 60 },
          }).catch(() => null);
          if (custom) break;
        }

        const doc = custom ? null : fallback(data.tenant.name);

        return (
          <main className="mx-auto max-w-3xl px-4 py-10">
            {custom ? (
              <CmsBody title={custom.title} html={custom.body} />
            ) : doc ? (
              <>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {doc.title}
                </h1>
                <p className="mt-4 opacity-75">{doc.intro}</p>
                {doc.sections.map((s) => (
                  <section key={s.heading} className="mt-7">
                    <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
                      {s.heading}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed opacity-75">{s.body}</p>
                  </section>
                ))}
                <p className="mt-10 text-xs opacity-50">
                  Texto modelo provisto por la plataforma. La tienda puede reemplazarlo creando una página
                  propia con el mismo nombre.
                </p>
              </>
            ) : null}
          </main>
        );
      }}
    </StorefrontPageShell>
  );
}
