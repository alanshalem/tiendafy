import type { SectionType, ThemeSection } from './envelope';
import { createSection } from './registry';

/**
 * Plantillas curadas de página de inicio: una estructura de secciones lista
 * para editar. Cada sección nace con el contenido de ejemplo del registro, así
 * la plantilla se ve en la vista previa apenas se aplica (antes eran secciones
 * vacías que no dibujaban nada y parecía que el botón no andaba).
 */
export interface HomeTemplate {
  id: string;
  name: string;
  description: string;
  sections: readonly SectionType[];
}

export const HOME_TEMPLATES: readonly HomeTemplate[] = [
  {
    id: 'lanzamiento',
    name: 'Lanzamiento',
    description: 'Hero con video, destacados y newsletter. Para presentar la marca con fuerza.',
    sections: ['hero-video', 'featured', 'info-bar', 'newsletter'],
  },
  {
    id: 'catalogo',
    name: 'Catálogo grande',
    description: 'Carrusel, categorías y varias grillas. Ideal si tenés muchos productos.',
    sections: ['carousel', 'category-banners', 'featured', 'new-products', 'info-bar'],
  },
  {
    id: 'editorial',
    name: 'Marca / Editorial',
    description: 'Imagen + texto e institucional. Cuenta una historia antes de vender.',
    sections: ['carousel', 'image-text', 'institutional', 'featured', 'info-bar'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Solo lo esencial: portada y destacados. Limpio y directo.',
    sections: ['carousel', 'featured'],
  },
  {
    id: 'ofertas',
    name: 'Ofertas',
    description: 'Productos en oferta y banners promocionales al frente.',
    sections: ['carousel', 'sale-products', 'promo-banners', 'featured', 'info-bar'],
  },
];

/** Las secciones de una plantilla, con ids nuevos y contenido de ejemplo. */
export function templateSections(template: Pick<HomeTemplate, 'sections'>): ThemeSection[] {
  return template.sections.map((type) => createSection(type));
}
