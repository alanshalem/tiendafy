import { richDocText } from '@tiendafy/types';
import { cn } from '@tiendafy/ui/cn';
import { SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { RichDocView } from './rich-doc';
import { SectionButton } from './section-button';

/** Texto con formato (editorial): título, texto largo, imagen opcional y botón. */
export function RichTextSection({ section, data }: SectionRenderProps<'rich-text'>) {
  const hasBody = richDocText(data.body) !== '';
  if (!data.title && !hasBody && !data.image) return null;

  const side = data.image && data.imagePosition !== 'top';
  const text = (
    <div className={cn('min-w-0', !side && 'mx-auto max-w-3xl')}>
      {data.title && (
        <SectionTitle align={section.style?.align} className="mb-4 text-2xl font-bold sm:text-3xl">
          {data.title}
        </SectionTitle>
      )}
      {hasBody && <RichDocView doc={data.body} className="text-fg/85" />}
      <div className="mt-6 empty:hidden">
        <SectionButton text={data.buttonText} link={data.link} />
      </div>
    </div>
  );
  const image = data.image && (
    <div
      className={cn(
        'relative aspect-[4/3] w-full overflow-hidden rounded-lg',
        !side && 'mx-auto mb-8 max-w-3xl aspect-[16/9]',
        side && data.imagePosition === 'right' && 'md:order-2',
      )}
    >
      <StoreImage
        src={data.image}
        alt=""
        sizes={side ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 100vw, 48rem'}
        className="object-cover"
      />
    </div>
  );

  return (
    <section className="mx-auto max-w-container px-4 py-12">
      {side ? (
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          {image}
          {text}
        </div>
      ) : (
        <>
          {image}
          {text}
        </>
      )}
    </section>
  );
}
