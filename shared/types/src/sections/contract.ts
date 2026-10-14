/* ============================================================
   Contrato del tema para el backend.

   El backend (C#) valida las secciones que guarda y sirve un tema por
   defecto a las tiendas nuevas. Para no mantener esas reglas dos veces,
   salen de acá: este objeto se escribe como JSON en
   backend/src/Modules/Themes/Themes.Infrastructure/theme-contract.json
   y el backend lo lee de ahí. Un test del admin
   (theme-contract.test.ts) falla si el archivo no coincide con lo que
   genera el código; con UPDATE_THEME_CONTRACT=1 lo reescribe.
   ============================================================ */

import { normalizeTheme, type ThemeConfig } from '../theme';
import {
  SECTION_ALIGNS,
  SECTION_BACKGROUNDS,
  SECTION_HIDE_ON,
  SECTION_SPACINGS,
  SECTION_TYPES,
} from './envelope';
import { THEME_SCHEMA_VERSION } from './migrations';
import { MAX_SECTIONS, SECTION_REGISTRY } from './registry';
import { LABEL_MAX, LONG_TEXT_MAX, SHORT_TEXT_MAX, URL_MAX, type FieldSpec, type FieldsSpec } from './schema';

/** El tema de una tienda recién creada: los defaults con las secciones iniciales, ya normalizado. */
export function defaultThemeConfig(): ThemeConfig {
  return normalizeTheme(null);
}

type ContractField =
  | { kind: 'string' | 'text'; max: number }
  | { kind: 'url' | 'media' | 'boolean' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'strings'; of: 'media' | 'id'; max: number }
  | { kind: 'items'; max: number; fields: Record<string, ContractField> }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'datetime' }
  | { kind: 'richtext'; max: number };

function contractField(spec: FieldSpec): ContractField {
  switch (spec.kind) {
    case 'string':
    case 'text':
      return { kind: spec.kind, max: spec.max };
    case 'url':
    case 'media':
    case 'boolean':
      return { kind: spec.kind };
    case 'enum':
      return { kind: 'enum', values: spec.values };
    case 'strings':
      return { kind: 'strings', of: spec.of, max: spec.max };
    case 'items':
      return { kind: 'items', max: spec.max, fields: contractFields(spec.fields) };
    case 'number':
      return { kind: 'number', min: spec.min, max: spec.max };
    case 'datetime':
      return { kind: 'datetime' };
    case 'richtext':
      return { kind: 'richtext', max: spec.max };
  }
}

const contractFields = (fields: FieldsSpec) =>
  Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, contractField(f)]));

/** El contrato completo, en el orden estable que se escribe a disco. */
export function buildThemeContract() {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    limits: {
      maxSections: MAX_SECTIONS,
      shortText: SHORT_TEXT_MAX,
      longText: LONG_TEXT_MAX,
      url: URL_MAX,
      label: LABEL_MAX,
    },
    envelope: {
      backgrounds: SECTION_BACKGROUNDS,
      spacings: SECTION_SPACINGS,
      aligns: SECTION_ALIGNS,
      hideOn: SECTION_HIDE_ON,
    },
    sections: Object.fromEntries(
      SECTION_TYPES.map((type) => {
        const def = SECTION_REGISTRY[type];
        return [type, { label: def.label, fields: contractFields(def.fields) }];
      }),
    ),
    defaultConfig: defaultThemeConfig(),
  };
}
