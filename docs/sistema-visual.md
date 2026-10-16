# Sistema visual

Las reglas de diseño. Leelas antes de armar un componente o una pantalla.

Hay tres superficies y cada una tiene dueño distinto:

| Superficie | Quién decide cómo se ve | Fuente de verdad |
| --- | --- | --- |
| Panel (admin) | La plataforma | `admin/src/index.css` + `@tiendafy/ui` |
| Tienda (storefront) | Cada tienda, desde el editor de diseño | El tema publicado (tokens + secciones) sobre `shared/design-system/styles/tokens.css` |
| Emails | Cada tienda (logo y color) | `BrandedEmailSender` en la API |

Esta instalación no tiene landing de plataforma: el dominio raíz es la tienda
principal de la importadora (`PRIMARY_STORE_SUBDOMAIN`). La dirección de marca
"obsidiana y papel" de junio de 2026 (Fraunces + Archivo, bermellón, sellos)
ya no tiene superficie propia; de ella quedan los valores por defecto de
`tokens.css` (abajo).

## Panel: herramienta de trabajo

**Dirección: estilo macOS.** Densidad de información, jerarquía clara y nada
de decoración que compita con los datos.

- **Tokens**: el panel pisa todos los de `tokens.css` en `admin/src/index.css`.
  Primario azul `#0066CC`; `accent` es el material de la barra lateral
  (`#F5F5F7` en claro, `#1C1C1E` en oscuro). Nunca un hex suelto en un
  componente: siempre las clases del preset (`bg-primary`, `text-fg`,
  `border-border`…).
- **Claro y oscuro**: `[data-theme='dark']` en `<html>`. Arranca con la
  preferencia del sistema, se cambia con `ThemeModeToggle` y se recuerda en
  `localStorage` (`admin/src/lib/themeMode.ts`). Todo componente nuevo se mira
  en los dos modos.
- **Tipografía**: la del sistema (`-apple-system`, SF Pro, Segoe UI…).
- **Contraste**: WCAG AA (4,5:1) en todo texto, también sobre los rellenos de
  estado en oscuro. Lo revisan `e2e/tests/accesibilidad.spec.ts` y axe en los
  tests de componentes de cada pantalla y cada diálogo.
- **Componentes**: siempre `@tiendafy/ui` (`Button`, `Input`, `Select`,
  `Table`, `Modal`, `Tabs`, `Toast`, `Confirm`, `PageHeader`, `EmptyList`…).
  Si falta uno, se agrega a la librería; no se improvisa en la
  pantalla. Clases de layout repetidas van en `admin/src/lib/styles.ts`.
- **Logo**: `LogoMark`, un cuadrado redondeado con el color primario y la
  inicial de la marca de la instalación (`VITE_BRAND_NAME`, por defecto
  "Tiendafy"). Favicon: `admin/public/favicon.svg`.
- **Motion**: transiciones cortas en hover y foco; el cambio de modo usa un
  reveal circular (View Transitions) que se apaga con
  `prefers-reduced-motion`. Sin reveals al hacer scroll ni parallax.

## Tienda: la marca es de cada tienda

**El default tiene que verse digno sin tocar nada; todo lo demás lo decide la
tienda.**

- **Tokens por defecto** (`tokens.css`): primario bermellón, `accent`
  obsidiana, fondo blanco y la fuente del sistema. Son lo que ve una tienda
  recién creada.
- **Personalización**: la tienda pisa esas variables en `:root` con los tokens
  de su tema publicado. Nada de estilos por tienda fuera de eso: si una tienda
  necesita algo que los tokens no expresan, se agrega un token o un campo de
  sección para todas.
- **Secciones**: 23 tipos, definidos una vez en
  `shared/types/src/sections/registry.ts` (campos, ejemplo, límites); de ahí
  salen el editor, la validación de la API y el renderer de la tienda. Ver el
  README de esa carpeta para agregar uno.
- **Fuentes**: 19 opciones (`FONT_OPTIONS` en `@tiendafy/types`), servidas
  desde la propia tienda; ninguna se precarga, el navegador baja solo la que
  aplica el tema. Cómo sumar una:
  [storefront/src/app/fonts/README.md](../storefront/src/app/fonts/README.md).
- **Diseños listos** (`admin/src/lib/themePresets.ts`): paletas por rubro y las
  "Marcas del grupo" (Puente Oriente, SmartFox, Volxen, Canicari). Las dos
  primeras salen de sus guías de marca en `docs/marca/`.
- **Contraste**: el color del texto sobre el primario se elige por contraste
  real, no por una regla fija; el primario usado como texto tiene su propia
  variante (`--color-primary-ink`) para llegar a 4,5:1.
- **Motion**: entradas escalonadas en grillas y nada más; siempre respetando
  `prefers-reduced-motion`.

## Emails

El layout lo pone `BrandedEmailSender`: una franja con el color primario de
la tienda, su logo (o el nombre si no tiene), cuerpo blanco con la fuente del
sistema y un pie con el nombre de la tienda. Las plantillas solo escriben el
contenido; no llevan estilos propios más allá de títulos y links.

## Antes de dar por terminada una pantalla

1. ¿Usa componentes de `@tiendafy/ui` y clases del preset, sin hex sueltos?
2. ¿Se ve bien en claro y en oscuro (panel) o con un tema que no es el default
   (tienda)?
3. ¿Pasa axe y tiene nombres accesibles en botones e inputs?
4. ¿Qué sigue siendo genérico, y qué de este archivo rompe?
