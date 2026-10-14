import { BannersEditor } from './banners';
import type { SectionEditorProps } from './types';

export function PromoBannersEditor(props: SectionEditorProps<'promo-banners'>) {
  return <BannersEditor {...props} withDescription imageKind="promoBanner" addLabel="Agregar promoción" />;
}
