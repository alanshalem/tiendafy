import { useConfirm } from '@tiendafy/ui';
import { baseTheme, type ThemeConfig } from '@tiendafy/types';
import { contrastText } from '../theme-editor-inputs';
import {
  BorderRadiusPanel,
  CartPanel,
  ColorsPanel,
  ComingSoonPanel,
  ContactPanel,
  CssPanel,
  FontsPanel,
  FooterPanel,
  HeaderPanel,
  ProductDetailPanel,
  ProductListPanel,
  RootNav,
  WhatsAppPanel,
} from '../theme-editor-panels';
import { HomePanel } from './sections/HomePanel';
import { SectionPanel } from './sections/SectionPanel';
import { LogoPanel } from './LogoPanel';

/** Prefijo de la vista de una sección del inicio: 'home:<id de la sección>'. */
export const SECTION_VIEW = 'home:';

/**
 * El panel izquierdo del editor según la vista abierta ('root', 'colors',
 * 'home', 'home:<id>'…). Cada panel recibe el tema y `updateTheme`.
 */
export function EditorViews({
  view,
  setView,
  theme,
  updateTheme,
  storeName,
  onOpenGallery,
  onLeave,
  onSearch,
  onHistory,
  onCopyFromStore,
  onRemoveSection,
  onFocusPreview,
}: {
  view: string;
  setView: (view: string) => void;
  theme: ThemeConfig;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
  storeName: string;
  onOpenGallery: () => void;
  onLeave: (path: string) => void;
  onSearch: () => void;
  onHistory: () => void;
  onCopyFromStore?: () => void;
  /** Quitar una sección del inicio (con "Deshacer"). */
  onRemoveSection: (id: string) => void;
  /** Resaltar una parte puntual de la vista previa (una columna del pie). */
  onFocusPreview?: (target: string) => void;
}) {
  const confirm = useConfirm();
  const toRoot = () => setView('root');
  const homeProps = {
    theme,
    onBack: toRoot,
    updateTheme,
    onOpenSection: (sid: string) => setView(`${SECTION_VIEW}${sid}`),
    onRemoveSection,
  };

  if (view.startsWith(SECTION_VIEW)) {
    const id = view.slice(SECTION_VIEW.length);
    const section = theme.sections.find((s) => s.id === id);
    // La sección abierta puede dejar de existir (deshacer hasta antes de
    // agregarla, restaurar otra versión, recargar el borrador de otra
    // pestaña): se vuelve a la lista en vez de romper el editor.
    if (!section) return <HomePanel {...homeProps} />;
    return (
      <SectionPanel
        section={section}
        theme={theme}
        onBack={() => setView('home')}
        onChange={(next) =>
          updateTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? next : s)) }))
        }
      />
    );
  }

  const panelProps = { theme, onBack: toRoot, updateTheme };
  switch (view) {
    case 'root':
      return (
        <RootNav
          onNavigate={setView}
          theme={theme}
          onOpenGallery={onOpenGallery}
          onLeave={onLeave}
          onSearch={onSearch}
          onHistory={onHistory}
          onCopyFromStore={onCopyFromStore}
        />
      );
    case 'logo':
      return <LogoPanel {...panelProps} storeName={storeName} />;
    case 'colors':
      return (
        <ColorsPanel
          theme={theme}
          onBack={toRoot}
          onReset={async () => {
            if (
              await confirm({
                title: 'Restablecer colores',
                message: '¿Volver los colores a los valores por defecto?',
                confirmLabel: 'Restablecer',
                variant: 'danger',
              })
            )
              updateTheme((t) => ({ ...t, colors: baseTheme.colors }));
          }}
          setColor={(key, value) => updateTheme((t) => ({ ...t, colors: { ...t.colors, [key]: value } }))}
          onToggleAccent={(on) => updateTheme((t) => ({ ...t, colors: { ...t.colors, useAccent: on } }))}
          applyPreset={(p) =>
            updateTheme((t) => ({
              ...t,
              colors: { ...t.colors, primary: p.primary, bg: p.bg, text: p.text },
              header: { ...t.header, bg: p.header, textColor: contrastText(p.header) },
            }))
          }
        />
      );
    case 'fonts':
      return <FontsPanel {...panelProps} />;
    case 'radius':
      return <BorderRadiusPanel {...panelProps} />;
    case 'header':
      return <HeaderPanel {...panelProps} />;
    case 'home':
      return <HomePanel {...homeProps} />;
    case 'products-list':
      return <ProductListPanel {...panelProps} />;
    case 'product-detail':
      return <ProductDetailPanel {...panelProps} />;
    case 'cart':
      return <CartPanel {...panelProps} />;
    case 'contact':
      return <ContactPanel {...panelProps} />;
    case 'whatsapp':
      return <WhatsAppPanel {...panelProps} />;
    case 'footer':
      return <FooterPanel {...panelProps} onFocusPreview={onFocusPreview} />;
    case 'css':
      return <CssPanel {...panelProps} />;
    case 'coming-soon':
      return <ComingSoonPanel {...panelProps} />;
    default:
      return null;
  }
}
