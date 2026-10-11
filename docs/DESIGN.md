# DESIGN.md — Tiendafy

Ground truth de diseño. Leer ANTES de construir cualquier componente o página.
Dos modos, reglas distintas (una landing no vive bajo las mismas leyes que un panel admin).

## Modo BRAND (landing, marketing, emails comerciales)

**Dirección v2 (2026-06): "obsidiana y papel"** — evolución de "editorial de
mercado" tras benchmark contra Empretienda/Tiendanube/Jumpseller. Qué tomamos:
producto-adelante en hero oscuro (el admin ES el hero), collage masonry de
tiendas con identidad. Qué conservamos: tipografía, bermellón (ownable — todo
el mercado es azul/verde/rosa), sellos, grano, ticker. Una sola dirección,
ejecutada completa.

- **Paleta**: obsidiana `#14100b` (zonas dark: hero, stats, CTA final, footer —
  con glow bermellón radial sutil) · papel `#faf5ed` (secciones editoriales) ·
  tinta `#1b1510` · bermellón `#e8501e` (ÚNICO acento fuerte) · tan `#e9dcc9` ·
  verde billete `#1e5b3f` (solo cues de plata). Ritmo de página:
  dark → papel → papel → dark → tan → papel → dark (bookends oscuros).
- **Tipografía**: Fraunces (display, `opsz` alto) + Archivo (texto/UI; grotesca
  argentina de Omnibus-Type — es parte de la historia del producto). Itálica
  SOLO como acento puntual (una palabra), nunca el h1 completo en itálica —
  el "italic-serif display hero" completo es fingerprint catalogado de
  marketing generado por IA (2025).
- **Firma visual**: grano de papel SVG, botones-sello con sombra dura
  `5px 5px 0 tinta` que se hunden al click, bordes de tinta 1.5–2px, stickers
  rotados, reglas tipográficas estilo periódico.
- **Presupuesto de motion**: DOS momentos — (1) carga del hero escalonada,
  (2) scroll reveals una sola vez por sección. Loops permitidos solo si son
  contenido (ticker, toasts de venta del mock). Todo lo demás estático.
  `prefers-reduced-motion` SIEMPRE respetado.

## Modo PRODUCT (admin, storefronts default de tenants)

**Dirección: utilitario cálido.** El admin es una herramienta de trabajo:
densidad de información, jerarquía clara, cero decoración que compita con los
datos del merchant.

- **Fuente de verdad**: tokens de `shared/design-system/styles/tokens.css` vía
  preset Tailwind (`bg-primary`, `text-fg`, `border-border`...). NUNCA colores
  hex hardcodeados en componentes de producto. Rebrand v2: `--color-primary` =
  bermellón, `--color-accent` = obsidiana (sidebar del admin la usa).
- **Logo**: sello bermellón rotado -4° con "t" serif itálica (SVG en
  `storefront/src/app/icon.svg`, copia en `admin/public/favicon.svg`,
  componente `LogoMark` inline donde haga falta).
- **Componentes**: siempre `@tiendafy/ui` (Button, Table, Modal, FormField...).
  Si falta un componente, se agrega a la librería — no se improvisa inline.
- **Theming por tenant**: los merchants personalizan SOLO vía override de CSS
  vars en `:root` (ThemeTokens). El storefront default debe verse digno sin
  personalización.
- **Motion**: transiciones de 150–200ms en hover/focus y nada más. Sin reveals,
  sin parallax — es una herramienta, no una demo.

## Anti-slop (ambos modos)

Prohibido: Inter/Roboto/Arial/system-ui como elección (no como fallback) ·
Space Grotesk (el "siguiente default") · gradientes violeta-rosa sobre blanco ·
glassmorphism · cards flotantes genéricas con sombras blandas · emojis como
sistema de iconos en UI de producto · hero h1 enteramente en itálica serif.

## Workflow

1. Componente nuevo de marketing → modo BRAND. Esta instalación ya no tiene
   landing de plataforma (el dominio raíz es la tienda de la importadora),
   así que el modo BRAND hoy aplica a emails comerciales y a las secciones
   de marca del editor de diseño, no a `landing.css`, que se borró.
2. Componente nuevo de producto → modo PRODUCT, `@tiendafy/ui` + tokens.
3. Ante la duda de intensidad: **restrained**. Distintivo = intencional, no raro.
4. Auditoría al cerrar una página: ¿qué sigue siendo genérico? ¿qué rompe este archivo?
