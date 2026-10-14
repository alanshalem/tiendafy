'use client';

import type { SectionRenderProps } from '../section-types';
import { BannerGrid } from './banner-grid';

export function CategoryBannersSection(props: SectionRenderProps<'category-banners'>) {
  return (
    <BannerGrid
      {...props}
      colsClass="sm:grid-cols-3"
      aspectClass="aspect-square"
      sizes="(max-width: 640px) 100vw, 33vw"
      caption={(b) =>
        b.title && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-2xl font-black uppercase text-white">
            {b.title}
          </span>
        )
      }
    />
  );
}
