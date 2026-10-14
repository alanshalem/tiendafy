/* ============================================================
   Migraciones del tema guardado.

   El tema es un JSON que vive años en la base: cuando cambia la forma
   de algo (p. ej. las imágenes del carrusel pasan de ser textos a ser
   diapositivas con título), los temas viejos se actualizan al LEERLOS,
   acá, en un solo lugar que usan el storefront y el editor (lo llama
   normalizeTheme). El backend no migra: guarda lo que manda el editor,
   que ya viene migrado y con `schemaVersion` al día.

   Agregar una migración = sumar una entrada al final de THEME_MIGRATIONS
   con `from` = la versión actual y `to` = from + 1. Ver README.md.
   ============================================================ */

import { upgradeSectionData } from './legacy';

export type RawTheme = Record<string, unknown>;

export interface ThemeMigration {
  from: number;
  to: number;
  /** Qué cambia y por qué (para quien lea el historial). */
  description: string;
  /**
   * Recibe el tema en la versión `from` y lo devuelve en la `to`. Tiene que
   * tolerar cualquier cosa (campos que faltan, tipos equivocados): los datos
   * viejos no pasaron por ninguna validación. No hace falta tocar
   * `schemaVersion`, lo pone el pipeline.
   */
  migrate: (theme: RawTheme) => RawTheme;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const THEME_MIGRATIONS: readonly ThemeMigration[] = [
  {
    from: 0,
    to: 1,
    description:
      'Sobre común de las secciones (nombre propio, dispositivos, estilo) y lista de secciones ' +
      'vacía = inicio vacío a propósito. Las secciones que no son objetos o vienen sin `data` ' +
      'se limpian acá para que ninguna versión posterior tenga que volver a contemplarlas.',
    migrate: (theme) => {
      if (!Array.isArray(theme.sections)) return theme;
      return {
        ...theme,
        sections: theme.sections.filter(isObject).map((s) => (isObject(s.data) ? s : { ...s, data: {} })),
      };
    },
  },
  {
    from: 1,
    to: 2,
    description:
      'Carrusel: `images: string[]` → `slides` (cada diapositiva con imagen de celular, texto ' +
      'alternativo, link y textos) y `fullHeightMobile` → `heightMobile`. Marcas: `images: string[]` ' +
      '→ `logos` (con nombre y link). Las mismas funciones las aplica el normalizador a la data ' +
      'que llega por otro camino (legacy.ts).',
    migrate: (theme) => {
      if (!Array.isArray(theme.sections)) return theme;
      return {
        ...theme,
        sections: theme.sections.map((s) =>
          isObject(s) && typeof s.type === 'string' && isObject(s.data)
            ? { ...s, data: upgradeSectionData(s.type, s.data) }
            : s,
        ),
      };
    },
  },
];

/** La versión del esquema que escriben el editor y el backend hoy. */
export const THEME_SCHEMA_VERSION: number = THEME_MIGRATIONS[THEME_MIGRATIONS.length - 1]!.to;

/**
 * Lleva un tema crudo a la versión actual, migración por migración. Nunca
 * tira: si una migración falla con datos imposibles, se corta ahí (sin marcar
 * la versión nueva, así se vuelve a intentar) y normalizeTheme rellena lo que
 * falte. Un tema sin `schemaVersion` es de antes de que existiera: versión 0.
 */
export function migrateTheme(
  raw: unknown,
  migrations: readonly ThemeMigration[] = THEME_MIGRATIONS,
): RawTheme {
  if (!isObject(raw)) return { schemaVersion: migrations[migrations.length - 1]?.to ?? 0 };
  let theme: RawTheme = raw;
  let version =
    typeof raw.schemaVersion === 'number' && Number.isInteger(raw.schemaVersion) && raw.schemaVersion >= 0
      ? raw.schemaVersion
      : 0;
  for (const m of migrations) {
    if (m.from !== version) continue;
    try {
      const next = m.migrate(theme);
      if (!isObject(next)) break; // una migración con un bug no se lleva puesto el tema
      theme = next;
      version = m.to;
    } catch {
      break;
    }
  }
  return { ...theme, schemaVersion: version };
}
