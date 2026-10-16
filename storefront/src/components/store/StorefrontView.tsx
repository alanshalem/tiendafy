import type { ReactNode } from 'react';
import type { ThemeConfig } from '@/lib/theme';
import { isDarkTheme } from '@/lib/theme-style';
import { productsBySection, type SectionProductsMap } from '@/lib/section-products';
import type { StoreProduct } from './ProductCard';
import { LiveStorefront, StoreChrome } from './store-islands';
import { StoreHome } from './StoreHome';
import { StoreRoot } from './StoreRoot';
import { StoreWhatsApp } from './StoreWhatsApp';

interface StorefrontViewProps {
  tenantId: string;
  tenantName: string;
  theme: ThemeConfig;
  products: StoreProduct[];
  /** Productos de las secciones de la portada, ya resueltos en el servidor (ver loadHomeSectionProducts). */
  sectionProducts?: SectionProductsMap;
  /** Vista previa del editor: el tema se actualiza en vivo por postMessage. */
  live?: boolean;
  /** El contenido de la página; sin él, la portada con sus secciones. */
  children?: ReactNode;
}

/**
 * La tienda: el marco (encabezado, pie, carrito) y el contenido de la página.
 *
 * Es un Server Component: la raíz con el tema, la portada y las secciones
 * que no necesitan el navegador salen como HTML del servidor, y el JS que
 * baja cada página es solo el de las islas que dibuja (el marco interactivo,
 * las secciones con carrusel o video, el kit de íconos de la tienda). Antes
 * todo esto era un componente de cliente, y cada ruta cargaba el encabezado,
 * el carrito, las veintitrés secciones y los cinco kits de íconos.
 *
 * En la vista previa del editor el tema cambia mientras se edita, así que la
 * tienda entera corre en el navegador (LiveStorefront).
 */
export function StorefrontView({
  tenantId,
  tenantName,
  theme,
  products,
  sectionProducts,
  live,
  children,
}: StorefrontViewProps) {
  if (live)
    return (
      <LiveStorefront
        tenantId={tenantId}
        tenantName={tenantName}
        theme={theme}
        products={products}
        sectionProducts={sectionProducts}
      >
        {children}
      </LiveStorefront>
    );

  // Lo resuelto, por id de sección: cada renderer de productos lo lee con
  // useSectionProducts.
  const bySection = productsBySection(theme.sections, sectionProducts ?? {});
  return (
    <StoreRoot theme={theme}>
      <StoreChrome
        tenantId={tenantId}
        tenantName={tenantName}
        theme={theme}
        products={products}
        sectionProducts={bySection}
      >
        {children ?? (
          <StoreHome
            sections={theme.sections}
            products={products}
            storeName={tenantName}
            productList={theme.productList}
            darkPage={isDarkTheme(theme)}
          />
        )}
      </StoreChrome>
      <StoreWhatsApp theme={theme} tenantName={tenantName} />
    </StoreRoot>
  );
}
