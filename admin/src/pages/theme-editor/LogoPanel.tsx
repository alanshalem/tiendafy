import type { ThemeConfig } from '@tiendafy/types';
import { MediaUpload } from '../../components/upload/MediaUpload';
import { useStore } from '../../context/StoreContext';
import { storefrontHost } from '../../lib/storefront';
import { BackHeader, Field, SegField, TextArea, TextInput } from '../theme-editor-inputs';
import { GoogleResultPreview, LengthMeter, SharePreview } from './SearchPreview';

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
  const { store } = useStore();
  // El dominio con el que la ve la gente: el propio si lo conectó, si no el subdominio.
  const host = store ? (store.customDomain ?? storefrontHost(store.subdomain)) : 'tu-tienda';
  const preview = {
    storeName,
    host,
    seoTitle: theme.seoTitle,
    seoDescription: theme.seoDescription,
    favicon: theme.favicon,
    shareImage: theme.shareImage,
  };
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
        {/* El tamaño se buscaba acá y vivía solo en "Encabezado". */}
        <SegField
          label="Tamaño en el encabezado"
          value={theme.header.logoSize}
          onChange={(logoSize) => updateTheme((t) => ({ ...t, header: { ...t.header, logoSize } }))}
          options={[
            {
              value: 'sm',
              label: 'Chico',
              visual: <span className="text-xs font-bold leading-none">Aa</span>,
            },
            {
              value: 'md',
              label: 'Mediano',
              visual: <span className="text-base font-bold leading-none">Aa</span>,
            },
            {
              value: 'lg',
              label: 'Grande',
              visual: <span className="text-2xl font-bold leading-none">Aa</span>,
            },
          ]}
        />
        <Field label="Favicon" hint="El ícono chico de la pestaña del navegador.">
          <MediaUpload
            kind="favicon"
            value={theme.favicon}
            onChange={(url) => updateTheme((t) => ({ ...t, favicon: url }))}
          />
        </Field>
        <Field label="Imagen al compartir">
          <MediaUpload
            kind="shareImage"
            value={theme.shareImage}
            onChange={(url) => updateTheme((t) => ({ ...t, shareImage: url }))}
          />
        </Field>
        <div>
          <div className="mb-2 text-xs font-medium text-fg-muted">
            Así se ve el link en un chat de WhatsApp
          </div>
          <div className="rounded-lg bg-[#efeae2] p-3">
            <SharePreview {...preview} />
          </div>
          {!theme.shareImage && (
            <p className="mt-2 text-xs text-fg-muted">
              Sin imagen, el link se ve chico y sin foto. Subí una de 1200 × 630 px (tu logo sobre un fondo de
              marca, o una foto de tus productos) y se ve grande.
            </p>
          )}
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold text-fg">Cómo aparecés en Google</div>
          <p className="mb-3 text-xs text-fg-muted">
            Título y descripción de tu tienda en los resultados de búsqueda. Si los dejás vacíos, se usa un
            texto con el nombre de la tienda.
          </p>
          {/* Se actualiza mientras escribís: el favicon, el dominio y los textos cortados como los corta Google. */}
          <GoogleResultPreview {...preview} />
          <div className="mt-4 space-y-4">
            <Field
              label="Título para buscadores"
              after={<LengthMeter kind="title" value={theme.seoTitle} />}
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
              after={<LengthMeter kind="description" value={theme.seoDescription} />}
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
