# Secciones del inicio

Todo lo que el sistema sabe de un tipo de sección vive en **una entrada** de
`SECTION_REGISTRY` (`registry.ts`): nombre, descripción, grupo del menú,
campos, contenido de ejemplo, límites y palabras de búsqueda. De esa entrada
salen:

- el tipo TS de la data (`DataOf<typeof campos>`, exportado como `FaqData`, etc.),
- el normalizador tolerante (`sectionData`, `normalizeSection`) que usan la tienda y el editor,
- el menú "Agregar sección", la lista del editor, el buscador (Ctrl+K), las plantillas y los presets,
- las reglas que valida la API al guardar (vía `theme-contract.json`, ver abajo).

| Archivo         | Qué tiene                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------- |
| `envelope.ts`   | `SECTION_TYPES` y el sobre común (`ThemeSection`: nombre, `hideOn`, `style`)                  |
| `schema.ts`     | el mini-lenguaje de campos (`field.*`), `normalizeFields`, links y medios seguros             |
| `registry.ts`   | `SECTION_REGISTRY`, `SectionDataMap` y los helpers (`createSection`, `sectionData`, `canAddSection`, `withinPageLimits`) |
| `legacy.ts`     | `LEGACY_DATA_UPGRADES`: formas viejas de la data de una sección → la de hoy                   |
| `migrations.ts` | `THEME_MIGRATIONS`, `THEME_SCHEMA_VERSION` y `migrateTheme` (lo aplica `normalizeTheme`)      |
| `templates.ts`  | plantillas de inicio (`HOME_TEMPLATES`)                                                       |
| `rich-text.ts`  | el documento de texto enriquecido y su normalizador                                           |
| `countdown.ts`  | horas de Argentina y partes de la cuenta regresiva                                            |
| `contract.ts`   | el JSON que lee el backend (validación + tema por defecto)                                    |
| `index.ts`      | lo que exporta el paquete                                                                     |

## Agregar un tipo de sección

1. **Registro**: sumá el tipo a `SECTION_TYPES` (`envelope.ts`), su entrada a
   `SECTION_REGISTRY` (`registry.ts`) con sus campos (`field.string()`,
   `field.items({...}, max)`, …), `defaults` con contenido de ejemplo que se
   vea, `limits.maxPerPage` si va una sola (lo respetan el editor, la API al
   guardar y la tienda, que dibuja solo las primeras), y su tipo en
   `SectionDataMap`.
2. **Renderer**: `storefront/src/components/store/sections/<tipo>.tsx` (recibe
   `SectionRenderProps<'<tipo>'>` con `data` ya normalizada) y una línea en
   `sections/registry.ts`. Para el título, `SectionTitle` (h2) de
   `components/store/section-primitives.tsx`.
3. **Editor**: `admin/src/pages/theme-editor/sections/<tipo>.tsx` (recibe
   `SectionEditorProps<'<tipo>'>`: `data` normalizada y `set(parche)`) y una
   línea en `sections/registry.ts`. El nombre propio y "Diseño de la sección"
   los pone `SectionPanel`; para listas, `ItemListEditor`.
4. **Miniatura**: el SVG de 96 × 64 que muestran el menú de agregar y las
   plantillas, en `admin/src/pages/theme-editor/sections/wireframes.tsx`.
5. **Contrato**: regenerá
   `backend/src/Modules/Themes/Themes.Infrastructure/theme-contract.json`
   (el backend valida con eso):

   ```bash
   UPDATE_THEME_CONTRACT=1 pnpm --filter ./admin exec vitest run theme-contract
   ```

   En PowerShell: `$env:UPDATE_THEME_CONTRACT=1; pnpm --filter ./admin exec vitest run theme-contract`.
   Si queda viejo, `theme-contract.test.ts` falla.

Los mapas de renderers, editores y miniaturas están tipados con `SectionType`:
si falta alguno, no compila.

## Cambiar la forma de algo guardado

Cuando cambia la FORMA de la data de una sección (p. ej. el carrusel pasó de
`images: string[]` a `slides` con título y link):

1. Escribí la conversión en `legacy.ts` y registrala en
   `LEGACY_DATA_UPGRADES`. Tiene que ser pura, no tirar nunca y ser
   idempotente (aplicada a data nueva, la devuelve igual). La usan la
   migración y también el normalizador, para la data que llega por otro
   camino (una pestaña vieja del editor, un JSON pegado a mano).
2. Sumá al final de `THEME_MIGRATIONS` una entrada
   `{ from: N, to: N + 1, description, migrate }`. `migrate` recibe el tema
   crudo y tiene que tolerar cualquier cosa (los datos viejos no pasaron por
   ninguna validación). No toques `schemaVersion`: lo pone `migrateTheme`. Si
   una migración tira, se corta ahí y se reintenta la próxima vez que se lea.
   El backend no migra: guarda lo que manda el editor, ya migrado.
3. Cambiá los campos del registro a la forma nueva (y su renderer y editor).
4. Regenerá el contrato (paso 5 de arriba): cambian el tema por defecto y la
   versión del esquema que conoce el backend.

El caso del carrusel tiene sus tests en `admin/src/__tests__/theme-registry.test.ts`.

## Reglas que no hay que romper

- **Normalizar nunca tira.** Lo que no es válido cae al `fallback` del campo; un
  `null` dentro de una lista se descarta.
- **`fallback` ≠ `defaults`.** `fallback` es lo que vale un campo que falta en
  datos viejos (tiene que dar el mismo render que antes). `defaults` es el
  contenido de ejemplo de una sección NUEVA.
- **Lo desconocido se conserva.** Campos o tipos que este código no conoce
  pasan tal cual: los pudo escribir una versión más nueva.
- **`sections: []` es un inicio vacío a propósito**; sin lista, van las iniciales.
