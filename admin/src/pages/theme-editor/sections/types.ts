import type { SectionDataMap, SectionType, ThemeSection } from '@tiendafy/types';

/**
 * Lo que recibe el editor de un tipo de sección (uno por archivo en esta
 * carpeta). `data` ya viene normalizada con el registro compartido: todos los
 * campos presentes y con su tipo. `set` mezcla un parche sobre la data.
 *
 * El nombre propio de la sección y su "Diseño de la sección" (fondo,
 * espaciado, alineación, dispositivos) los pone SectionPanel alrededor: el
 * editor de cada tipo solo se ocupa de su contenido.
 */
export interface SectionEditorProps<T extends SectionType = SectionType> {
  section: ThemeSection;
  data: SectionDataMap[T];
  set: (patch: Partial<SectionDataMap[T]>) => void;
}
