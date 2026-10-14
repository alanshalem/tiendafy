// Secciones del inicio: registro, sobre común, esquema de campos, migraciones
// y plantillas. Ver README.md para agregar un tipo o una migración.
export {
  SECTION_TYPES,
  SECTION_BACKGROUNDS,
  SECTION_SPACINGS,
  SECTION_ALIGNS,
  SECTION_HIDE_ON,
  isSectionType,
  isRgbTriplet,
  normalizeSectionStyle,
  normalizeHideOn,
} from './envelope';
export type {
  SectionType,
  ThemeSection,
  SectionStyle,
  SectionBackground,
  SectionSpacing,
  SectionAlign,
  SectionHideOn,
} from './envelope';
export {
  SECTION_REGISTRY,
  SECTION_DEFINITIONS,
  SECTION_GROUPS,
  INFO_ICONS,
  MAX_SECTIONS,
  PRODUCT_SECTION_COLUMNS,
  PRODUCT_SECTION_MOBILE_COLUMNS,
  TESTIMONIAL_RATINGS,
  sectionDefinition,
  sectionDisplayName,
  sectionData,
  canAddSection,
  createSection,
  normalizeSection,
  normalizeSections,
} from './registry';
export type {
  SectionDefinition,
  SectionGroup,
  SectionWireframe,
  SectionDataMap,
  HeroVideoData,
  CarouselData,
  ProductsData,
  BannersData,
  BannerItem,
  InstitutionalData,
  ImageTextData,
  InfoBarData,
  InfoItemData,
  NewsletterData,
  InstagramData,
  TestimonialsData,
  TestimonialItem,
  FaqData,
  FaqItem,
  BrandsData,
} from './registry';
export {
  field,
  normalizeFields,
  isSafeLink,
  isSafeMedia,
  isPlainObject,
  SHORT_TEXT_MAX,
  LONG_TEXT_MAX,
  URL_MAX,
  LABEL_MAX,
} from './schema';
export type { FieldSpec, FieldsSpec, DataOf, ItemBase } from './schema';
export { THEME_MIGRATIONS, THEME_SCHEMA_VERSION, migrateTheme } from './migrations';
export type { ThemeMigration, RawTheme } from './migrations';
export { HOME_TEMPLATES, templateSections } from './templates';
export type { HomeTemplate } from './templates';
export { buildThemeContract, defaultThemeConfig } from './contract';
