import { BannersEditor } from './banners';
import type { SectionEditorProps } from './types';

export function CategoryBannersEditor(props: SectionEditorProps<'category-banners'>) {
  return <BannersEditor {...props} imageKind="categoryBanner" addLabel="Agregar categoría" />;
}
