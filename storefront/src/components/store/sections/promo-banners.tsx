'use client';

import { cn } from '@tiendafy/ui';
import type { SectionRenderProps } from '../section-types';
import { BannerGrid } from './banner-grid';

export function PromoBannersSection({ data }: SectionRenderProps<'promo-banners'>) {
  const desktop = Number(data.columns);
  const mobile = Number(data.columnsMobile);
  const banners = data.banners
    .filter((b) => b.show)
    .map((b) => ({ ...b, name: b.title || b.description || b.buttonText }));
  return (
    <BannerGrid
      title={data.title}
      banners={banners}
      fullWidth={data.fullWidth}
      cols={{ mobile, tablet: Math.min(desktop, 2), desktop }}
      ratio={data.ratio}
      ratioMobile={data.ratioMobile === 'same' ? undefined : data.ratioMobile}
      textPosition={data.textPosition}
      overlay={data.overlay}
      caption={(b) =>
        b.title || b.description || b.buttonText ? (
          <>
            {b.title && (
              <span className="line-clamp-2 text-base font-bold leading-tight sm:text-lg">{b.title}</span>
            )}
            {b.description && (
              // En dos columnas de celular no entra: queda el título.
              <span className={cn('line-clamp-2 text-sm opacity-95', mobile === 2 && 'max-sm:hidden')}>
                {b.description}
              </span>
            )}
            {b.buttonText && (
              // Un <span> con forma de botón: el banner entero ya es el link
              // (un link adentro de otro no se puede).
              <span className="mt-1 inline-flex min-h-9 w-fit items-center rounded-md bg-white px-4 text-sm font-semibold text-black/85 [text-shadow:none] group-hover:bg-white/90">
                {b.buttonText}
              </span>
            )}
          </>
        ) : null
      }
    />
  );
}
