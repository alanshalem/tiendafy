'use client';

import type { SectionRenderProps } from '../section-types';
import { BannerGrid } from './banner-grid';

export function PromoBannersSection(props: SectionRenderProps<'promo-banners'>) {
  return (
    <BannerGrid
      {...props}
      colsClass="sm:grid-cols-2 lg:grid-cols-3"
      aspectClass="aspect-[16/9]"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      caption={(b) =>
        (b.title || b.description) && (
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
            {b.title && <span className="block text-lg font-bold">{b.title}</span>}
            {b.description && <span className="block text-sm opacity-90">{b.description}</span>}
          </span>
        )
      }
    />
  );
}
