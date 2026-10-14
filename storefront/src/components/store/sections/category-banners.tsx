'use client';

import type { SectionRenderProps } from '../section-types';
import { BannerGrid } from './banner-grid';

export function CategoryBannersSection({ data }: SectionRenderProps<'category-banners'>) {
  const desktop = Number(data.columns);
  const banners = data.banners.filter((b) => b.show).map((b) => ({ ...b, name: b.title }));
  return (
    <BannerGrid
      title={data.title}
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
          <span className="line-clamp-3 max-w-full break-words px-1 text-base font-black uppercase leading-tight [hyphens:auto] sm:text-2xl">
            {b.title}
          </span>
        ) : null
      }
    />
  );
}
