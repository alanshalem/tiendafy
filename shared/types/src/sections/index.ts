// Secciones del inicio: registro, sobre común, esquema de campos, migraciones
// y plantillas. Ver README.md para agregar un tipo o una migración.
export { SECTION_TYPES, isSectionType, isRgbTriplet, normalizeSectionStyle } from './envelope';
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
  TEXT_POSITIONS,
  BANNER_RATIOS,
  VIDEO_RATIOS,
  MAX_SECTIONS,
  sectionDefinition,
  sectionDisplayName,
  sectionData,
  canAddSection,
  withinPageLimits,
  createSection,
  normalizeSection,
  normalizeSections,
} from './registry';
export type {
  SectionDefinition,
  SectionGroup,
  SectionDataMap,
  HeroVideoData,
  CarouselData,
  CarouselSlide,
  ProductsData,
  PromoBannersData,
  PromoBannerItem,
  CategoryBannersData,
  CategoryBannerItem,
  Overlay,
  TextPosition,
  BannerRatio,
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
  BrandLogo,
  CountdownOfferData,
  FeaturedProductData,
  PromoPopupData,
  RichTextData,
  CategoryListData,
  CategoryListItem,
  VideoData,
  IconColumnsData,
  IconColumnItem,
  CollageData,
  CollageBlock,
} from './registry';
export { upgradeCarouselData, upgradeBrandsData } from './legacy';
export {
  field,
  normalizeFields,
  isSafeLink,
  isSafeMedia,
  isIsoDateTime,
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
export { RICH_MAX_DEPTH, emptyRichDoc, normalizeRichDoc, richDocText, richDocFromText } from './rich-text';
export type { RichDoc, RichBlock, RichInline, RichListItem, RichMark, RichHeadingLevel } from './rich-text';
export {
  isoToArgentinaLocal,
  argentinaLocalToIso,
  formatArgentinaEnd,
  countdownParts,
  countdownSpeech,
} from './countdown';
export type { CountdownParts } from './countdown';
