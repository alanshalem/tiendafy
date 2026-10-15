import { cn } from '@tiendafy/ui/cn';
import type { SectionRenderProps } from '../section-types';
import { BannerGrid } from './banner-grid';

export function CategoryBannersSection({
  section,
  data,
  lead,
  preview,
}: SectionRenderProps<'category-banners'>) {
  const desktop = Number(data.columns);
  const banners = data.banners.filter((b) => b.show).map((b) => ({ ...b, name: b.title }));
  return (
    <BannerGrid
      title={data.title}
      align={section.style?.align}
      lead={lead}
      preview={preview}
      banners={banners}
      fullWidth={data.fullWidth}
      cols={{ mobile: Number(data.columnsMobile), tablet: Math.min(desktop, 3), desktop }}
      ratio={data.ratio}
      textPosition={data.textPosition}
      overlay={data.overlay}
      caption={(b) =>
        b.title ? (
          // Con margen y cortando en palabras: un nombre largo ya no toca los
          // bordes ni se sale del cuadrado.
          <span
            className={cn(
              'line-clamp-3 max-w-full break-words px-1 text-base font-black uppercase leading-tight [hyphens:auto]',
              // Con 5 o 6 por fila la foto mide ~200 px: en 2xl "Discos y barras" iba en tres renglones.
              desktop >= 5 ? 'sm:text-xl lg:text-lg' : 'sm:text-2xl',
            )}
          >
            {b.title}
          </span>
        ) : null
      }
    />
  );
}
