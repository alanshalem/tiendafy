# Secciones del inicio

Todo lo que el sistema sabe de un tipo de sección vive en **una entrada** de
`registry.ts`: nombre, descripción, grupo del menú, maqueta, campos, contenido
de ejemplo, límites y palabras de búsqueda. De esa entrada salen:

- el tipo TS de la data (`DataOf<typeof campos>`, exportado como `FaqData`, etc.),
- el normalizador tolerante (`sectionData`, `normalizeSection`) que usan la tienda y el editor,
- el menú "Agregar sección", la lista del editor, el buscador (Ctrl+K), las plantillas y los presets,
- las reglas que valida la API al guardar (vía `theme-contract.json`, ver abajo).

| Archivo         | Qué tiene                                                                        |
| --------------- | -------------------------------------------------------------------------------- |
| `envelope.ts`   | `SECTION_TYPES`, el sobre común (`ThemeSection`: nombre, `hideOn`, `style`)       |
| `schema.ts`     | el mini-lenguaje de campos (`field.*`), `normalizeFields`, links seguros          |
| `registry.ts`   | `SECTION_REGISTRY` y los helpers (`createSection`, `sectionData`, `canAddSection`) |
| `migrations.ts` | `THEME_MIGRATIONS`, `migrateTheme` (lo aplica `normalizeTheme`)                  |
| `templates.ts`  | plantillas de inicio                                                             |
| `contract.ts`   | el JSON que lee el backend (validación + tema por defecto)                       |

## Agregar un tipo de sección

1. **Registro**: sumar el tipo a `SECTION_TYPES` (`envelope.ts`) y su entrada a
   `SECTION_REGISTRY` (`registry.ts`) con sus campos (`field.string()`,
   `field.items({...}, max)`, …), `defaults` con contenido de ejemplo que se vea,
   `limits.maxPerPage` si va una sola (lo respetan el editor, la API al guardar
   —va en el contrato— y la tienda, que dibuja solo las primeras), y su tipo en
   `SectionDataMap`.
2. **Renderer**: `storefront/src/components/store/sections/<tipo>.tsx` (recibe
   `SectionRenderProps<'<tipo>'>` con `data` ya normalizada) y una línea en
   `sections/registry.ts`. Para el título usar `SectionTitle` (h2).
3. **Editor**: `admin/src/pages/theme-editor/sections/<tipo>.tsx` (recibe
   `SectionEditorProps<'<tipo>'>`: `data` normalizada y `set(parche)`) y una
   línea en `sections/registry.ts`. Nombre propio y "Diseño de la sección" los
   pone `SectionPanel`; para listas usar `ItemListEditor`.
4. **Contrato**: `UPDATE_THEME_CONTRACT=1 pnpm --filter ./admin exec vitest run theme-contract`
   regenera `backend/src/Modules/Themes/Themes.Infrastructure/theme-contract.json`
   (el backend valida con eso). Los tests fallan si queda viejo.

Los mapas de renderers y editores están tipados con `SectionType`: si falta
alguno, no compila. La maqueta (`wireframe`) reusa una de las que dibuja
`admin/.../sections/wireframes.tsx` (o se suma un caso ahí).

## Agregar una migración

Cuando cambia la FORMA de algo guardado (p. ej. el carrusel pasa de
`images: string[]` a diapositivas con título y link):

1. Sumar al final de `THEME_MIGRATIONS` una entrada `{ from: N, to: N + 1, description, migrate }`.
   `migrate` recibe el tema crudo y devuelve el nuevo; tiene que tolerar cualquier
   cosa (los datos viejos no pasaron por ninguna validación). No toques
   `schemaVersion`: lo pone el pipeline. Si tira, se corta y se reintenta la
   próxima vez que se lea.
2. Cambiar los campos del registro a la forma nueva (y su renderer/editor).
3. Regenerar el contrato (paso 4 de arriba): el tema por defecto y la versión
   del esquema que conoce el backend cambian.

Hay un ejemplo completo (carrusel → diapositivas) en
`admin/src/__tests__/theme-registry.test.ts`.

## Reglas que no hay que romper

- **Normalizar nunca tira.** Lo que no es válido cae al `fallback` del campo; un
  `null` dentro de una lista se descarta.
- **`fallback` ≠ `defaults`.** `fallback` es lo que vale un campo que falta en
  datos viejos (tiene que dar el mismo render que antes). `defaults` es el
  contenido de ejemplo de una sección NUEVA.
- **Lo desconocido se conserva.** Campos o tipos que este código no conoce
  pasan tal cual: los pudo escribir una versión más nueva.
- **`sections: []` es un inicio vacío a propósito**; sin lista, van las iniciales.
