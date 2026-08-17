// Barrel de los paneles del editor de temas: cada panel vive en su archivo
// (nav, colores, fuentes, encabezado, páginas, contacto, pie, estilo).
export { RootNav } from './theme-editor-nav';
export { ColorsPanel } from './theme-editor-colors';
export { FontsPanel } from './theme-editor-fonts';
export { HeaderPanel } from './theme-editor-header';
export {
  CartPanel,
  ComingSoonPanel,
  ContactPanel,
  ProductDetailPanel,
  ProductListPanel,
  type PanelProps,
} from './theme-editor-pages';
export { WhatsAppPanel } from './theme-editor-contact';
export { FooterPanel } from './theme-editor-footer';
export { BorderRadiusPanel, CssPanel } from './theme-editor-style';
