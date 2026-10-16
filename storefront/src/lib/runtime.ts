/**
 * Config que el navegador recibe AL ARRANCAR, no al compilar.
 *
 * Next hornea las `NEXT_PUBLIC_*` dentro del bundle del cliente, así que una
 * imagen compilada apuntando a staging es de staging para siempre. Eso rompe
 * lo único que hace confiable a un deploy: que lo que se probó sea exactamente
 * lo que sale a producción.
 *
 * El servidor renderiza estos valores en el HTML (ver `RuntimeConfigScript`) y
 * el cliente los lee de ahí. Si no están —desarrollo, o un render viejo— cae a
 * las variables de build de siempre.
 */
interface RuntimeConfig {
  apiUrl: string;
  adminOrigin: string;
  sentryDsn: string;
  /** 'production' | 'staging' | … — etiqueta los errores en Sentry. */
  envName: string;
}

declare global {
  interface Window {
    __TIENDAFY_CONFIG__?: Partial<RuntimeConfig>;
  }
}

const DEFAULTS: RuntimeConfig = {
  apiUrl: 'http://localhost:5080',
  adminOrigin: 'http://localhost:5173',
  sentryDsn: '',
  envName: 'development',
};

/**
 * Config del lado servidor: sale del entorno del contenedor en cada arranque.
 *
 * Los nombres van SIN el prefijo `NEXT_PUBLIC_` a propósito: Next reemplaza
 * esas variables por su valor literal al compilar, en el bundle del cliente y
 * también en el del servidor. Una variable con ese prefijo nunca se lee en
 * runtime, por más que se la pase el contenedor. Las `NEXT_PUBLIC_*` quedan
 * como respaldo para desarrollo, donde el build es el de tu máquina.
 */
export function serverRuntimeConfig(): RuntimeConfig {
  return {
    apiUrl: process.env.PUBLIC_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULTS.apiUrl,
    adminOrigin:
      process.env.PUBLIC_ADMIN_ORIGIN?.trim() ||
      process.env.NEXT_PUBLIC_ADMIN_ORIGIN?.trim() ||
      DEFAULTS.adminOrigin,
    sentryDsn:
      process.env.PUBLIC_SENTRY_DSN?.trim() ||
      process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
      DEFAULTS.sentryDsn,
    envName: process.env.APP_ENV?.trim() || process.env.NODE_ENV || DEFAULTS.envName,
  };
}

/**
 * Un valor de config, mire quien mire: en el navegador gana lo inyectado por el
 * servidor; en el servidor (SSR) se lee el entorno directo.
 */
export function runtimeValue<K extends keyof RuntimeConfig>(key: K): RuntimeConfig[K] {
  if (typeof window !== 'undefined') {
    const injected = window.__TIENDAFY_CONFIG__?.[key];
    if (injected) return injected;
  }
  return serverRuntimeConfig()[key];
}
