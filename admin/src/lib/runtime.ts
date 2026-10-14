/**
 * Config que el admin recibe AL ARRANCAR, no al compilar.
 *
 * Un bundle de Vite hornea las `VITE_*` adentro del JavaScript, así que una
 * imagen compilada apuntando a staging es una imagen de staging para siempre.
 * Eso rompe lo único que hace confiable a un deploy: que lo que probaste sea
 * exactamente lo que sale a producción.
 *
 * Con esto, la misma imagen sirve para los dos ambientes: el contenedor escribe
 * `/config.js` cuando arranca y de ahí salen la URL de la API y las tiendas.
 * En desarrollo ese archivo viene vacío y manda el `.env` de siempre.
 */
export interface RuntimeConfig {
  apiUrl?: string;
  /**
   * Nombre de la instalación. El producto es Tiendafy; una instalación puede
   * llevar la marca de quien la opera ("Puente Oriente") sin recompilar nada.
   * Solo afecta al panel: cada tienda muestra SU marca al comprador.
   */
  brandName?: string;
  storefrontOrigin?: string;
  /**
   * La tienda que atiende el dominio pelado (PRIMARY_STORE_SUBDOMAIN de la
   * tienda). Su dirección pública es el dominio a secas, no {sub}.dominio.
   */
  primaryStoreSubdomain?: string;
  sentryDsn?: string;
  /** 'production' | 'staging' | … — se usa para etiquetar los errores en Sentry. */
  envName?: string;
}

declare global {
  interface Window {
    __TIENDAFY_CONFIG__?: RuntimeConfig;
  }
}

const injected: RuntimeConfig = (typeof window !== 'undefined' && window.__TIENDAFY_CONFIG__) || {};

/** Valor de runtime, si no el de build, si no el default de desarrollo. */
const pick = (fromServer: string | undefined, fromBuild: string | undefined, fallback: string) =>
  fromServer?.trim() || fromBuild?.trim() || fallback;

export const runtime = {
  apiUrl: pick(injected.apiUrl, import.meta.env.VITE_API_URL, 'http://localhost:5080'),
  storefrontOrigin: pick(
    injected.storefrontOrigin,
    import.meta.env.VITE_STOREFRONT_ORIGIN as string | undefined,
    'http://{sub}.localhost:3000',
  ),
  primaryStoreSubdomain: pick(
    injected.primaryStoreSubdomain,
    import.meta.env.VITE_PRIMARY_STORE_SUBDOMAIN as string | undefined,
    '',
  ).toLowerCase(),
  sentryDsn: pick(injected.sentryDsn, import.meta.env.VITE_SENTRY_DSN as string | undefined, ''),
  envName: pick(injected.envName, undefined, import.meta.env.MODE),
  brandName: pick(injected.brandName, import.meta.env.VITE_BRAND_NAME as string | undefined, 'Tiendafy'),
} as const;

/** El nombre que ve quien usa el panel. */
export const BRAND = runtime.brandName;
