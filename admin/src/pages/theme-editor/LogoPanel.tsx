import type { ThemeConfig } from '@tiendafy/types';
import { MediaUpload } from '../../components/upload/MediaUpload';
import { BackHeader, Field, TextArea, TextInput } from '../theme-editor-inputs';

/** "Identidad de tu tienda": logo, favicon, imagen al compartir y cómo aparece en Google. */
export function LogoPanel({
  theme,
  storeName,
  onBack,
  updateTheme,
}: {
  theme: ThemeConfig;
  storeName: string;
  onBack: () => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  return (
    <div>
      <BackHeader title="Identidad de tu tienda" onBack={onBack} />
      <div className="space-y-5 p-4">
        <Field
          label="Logo de la tienda"
          hint="Se muestra en el encabezado. Si no cargás logo, se muestra el nombre de la tienda."
        >
          <MediaUpload
            kind="logo"
            value={theme.logo}
            onChange={(url) => updateTheme((t) => ({ ...t, logo: url }))}
          />
        </Field>
        <Field label="Favicon" hint="El ícono chico de la pestaña del navegador.">
          <MediaUpload
            kind="favicon"
            value={theme.favicon}
            onChange={(url) => updateTheme((t) => ({ ...t, favicon: url }))}
          />
        </Field>
        <Field
          label="Imagen al compartir"
          hint="La que se ve al compartir el link en redes (WhatsApp, Instagram…)."
        >
          <MediaUpload
            kind="shareImage"
            value={theme.shareImage}
            onChange={(url) => updateTheme((t) => ({ ...t, shareImage: url }))}
          />
        </Field>
        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold text-fg">Cómo aparecés en Google</div>
          <p className="mb-3 text-xs text-fg-muted">
            Título y descripción de tu tienda en los resultados de búsqueda. Vacío = se usa el nombre de la
            tienda.
          </p>
          <div className="space-y-4">
            <Field
              label="Título para buscadores"
              hint="Ideal: hasta 60 caracteres, con lo que vendés. Ej: «Volxen — Ropa de gimnasio»"
            >
              <TextInput
                value={theme.seoTitle}
                onChange={(v) => updateTheme((t) => ({ ...t, seoTitle: v }))}
                placeholder={`${storeName} — Tienda online`}
              />
            </Field>
            <Field
              label="Descripción para buscadores"
              hint="Ideal: 150-160 caracteres que inviten a hacer click."
            >
              <TextArea
                value={theme.seoDescription}
                onChange={(v) => updateTheme((t) => ({ ...t, seoDescription: v }))}
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
