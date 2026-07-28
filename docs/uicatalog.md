# Catálogo de elementos UI — namethatui.com

- **Fuente:** [https://namethatui.com/](https://namethatui.com/) (elementos de la categoría Web, `/web/<slug>`)  
- **Fecha de relevamiento:** 2026-07-23  
- **Cantidad de elementos:** 39  
- **Propósito:** base de conocimiento para que Claude Code implemente componentes UI en un frontend existente (React 19 \+ TypeScript \+ Vite), usando los nombres canónicos, la anatomía y los prompts de implementación/debug de cada elemento.

## Instrucciones para Claude Code

Antes de implementar un componente, buscá su sección en este catálogo. Respetá los nombres canónicos de la anatomía para props, slots y clases. Usá el 'Prompt de implementación' como especificación base, adaptándolo a las convenciones y design tokens del proyecto. Ante conflicto entre este catálogo y las convenciones del proyecto, ganan las del proyecto.

## Índice

| Elemento | Slug | Aliases | Relacionados |
| :---- | :---- | :---- | :---- |
| Parallax Scrolling | `parallax` | parallax effect, parallax background, scroll-linked depth effect, fixed background | Sticky vs. Fixed Positioning, Easing (Timing Function), Spring Animation |
| Date Picker | `date-picker` | Calendar picker, calendar popup, calendar dropdown, date range picker, month view | Form Field, Popover vs. Dropdown Menu vs. Tooltip, Combobox (Autocomplete / Typeahead) |
| Pagination | `pagination` | pager, paging controls, page navigation, page numbers, page control | Carousel, Tabs, Truncation (Ellipsis & Line Clamp) |
| Sign-in Form | `sign-in-form` | login form, login page, login screen, sign-in page, auth form, authentication form | Form Field, Focus Ring (:focus-visible), Divider vs. Separator vs. Rule |
| Carousel | `carousel` | Slider, content slider, slideshow, image slider, swiper | Marquee, Lightbox, Tabs, Pagination |
| Site Header vs. Navigation Bar | `header-navbar` | navbar, topbar, app bar, main navigation, page header | Hamburger Menu (Nav Drawer), Sticky vs. Fixed Positioning, Breadcrumbs, Menu Bar |
| Card | `card` | tile, card component, content card, status card | Bento Grid, Masonry Layout (Pinterest Grid), Hover Card, Skeleton vs. Spinner |
| Resize Handle (Size Grip) | `resize-handle` | size grip, resize grip, gripper, resizer, drag corner | Form Field (Web), Drag & Drop (Web) |
| Hamburger Menu (Nav Drawer) | `hamburger-menu` | navigation drawer, hamburger button, side menu, off-canvas menu | The Three Dots (Overflow Menu), Modal Dialog vs. Drawer vs. Sheet, Scrim (Backdrop / Overlay), Site Header vs. Navigation Bar |
| Bento Grid | `bento-grid` | Bento box layout, feature grid, dashboard grid | Masonry Layout (Pinterest Grid), Drag & Drop, Card |
| Masonry Layout (Pinterest Grid) | `masonry` | Waterfall layout, pinterest grid, brick layout | Bento Grid, Lightbox, Card |
| Easing (Timing Function) | `easing` | timing function, easing curve, bezier curve | Spring Animation, Marquee, Parallax Scrolling |
| Spring Animation | `spring` | spring physics, bouncy animation, spring transition | Easing (Timing Function), Toast (Snackbar), Parallax Scrolling |
| Text Scramble (Decode Effect) | `text-scramble` | decode effect, matrix text effect, shuffle text | Marquee, Skeleton vs. Spinner |
| Lightbox | `lightbox` | image viewer overlay, photo modal, gallery overlay | Scrim (Backdrop / Overlay), Modal Dialog vs. Drawer vs. Sheet |
| Marquee | `marquee` | ticker, logo carousel, auto-scrolling strip | — |
| Form Field | `form-field` | Text field, input field, form input, form control | Focus Ring (:focus-visible), Combobox (Autocomplete/Typeahead), Switch vs. Checkbox vs. Radio |
| Truncation (Ellipsis & Line Clamp) | `truncation` | ellipsis, text overflow, line clamp, clamped text, truncated text | The Three Dots (Overflow Menu), Breadcrumbs, Marquee, Pagination |
| Drag & Drop | `drag-and-drop` | drag and drop, drag-and-drop interaction, direct manipulation, sortable drag | Split View, Focus Ring (:focus-visible), The Three Dots (Overflow Menu) |
| Divider vs. Separator vs. Rule | `divider` | separator, rule, horizontal rule, visual divider | Menu Bar (macOS), Context Menu (macOS), Split View (macOS), The Three Dots (Overflow Menu) (Web), Sign-in Form (Web) |
| Progress Ring vs. Spinner vs. Progress Bar | `progress-indicators` | circular progress indicator, loading spinner, determinate progress indicator, linear progress indicator | Skeleton vs. Spinner, Marquee |
| The Three Dots (Overflow Menu) | `three-dots` | kebab menu, meatball menu, hamburger menu, overflow menu, more menu, ellipsis button | Truncation (Ellipsis & Line Clamp), Popover vs. Dropdown Menu vs. Tooltip, Modal Dialog vs. Drawer vs. Sheet, Context Menu, Scrim (Backdrop / Overlay), Hamburger Menu (Nav Drawer) |
| Modal Dialog vs. Drawer vs. Sheet | `dialog-drawer-sheet` | modal, side panel, slide-over, bottom sheet | Scrim (Backdrop / Overlay), Popover vs. Dropdown Menu vs. Tooltip, Sheet (macOS), Sidebar (Source List), Lightbox, Hamburger Menu (Nav Drawer) |
| Popover vs. Dropdown Menu vs. Tooltip | `popover-dropdown-tooltip` | popup, menu, hover hint, toggletip | Modal Dialog vs. Drawer vs. Sheet, Hover Card, Context Menu, Popover |
| Scrim (Backdrop / Overlay) | `scrim` | backdrop, overlay, modal overlay | Modal Dialog vs. Drawer vs. Sheet, Popover vs. Dropdown Menu vs. Tooltip, Visual Effect Material (Vibrancy), Lightbox |
| Skeleton vs. Spinner | `skeleton-spinner` | skeleton screen, placeholder loader, loading spinner, throbber | Empty State, Toast (Snackbar), Focus Ring (:focus-visible), Text Scramble (Decode Effect) |
| Combobox (Autocomplete / Typeahead) | `combobox` | autocomplete, typeahead, search select, editable dropdown | Command Palette (Web), Pop-Up Button vs. Pull-Down Button vs. Combo Box (macOS), Popover vs. Dropdown Menu vs. Tooltip (Web) |
| Command Palette | `command-palette` | command menu, quick actions, launcher, command bar | Combobox (Autocomplete / Typeahead), Modal Dialog vs. Drawer vs. Sheet, Focus Ring (:focus-visible), Toolbar (Unified Title Bar) |
| Accordion (Disclosure) | `accordion` | disclosure, expandable sections, collapse, expander | Tabs (Web), Disclosure Triangle (macOS), Sidebar/Source List (macOS) |
| Tabs | `tabs` | tabbed interface, tab list, tab bar | Accordion (Disclosure), Toggle Group (Segmented Control), Segmented Control |
| Badge | `badge-chip-pill` | token, lozenge, capsule | Dock Badge (macOS), Toggle Group (Segmented Control) (Web), Switch vs. Checkbox vs. Radio (Web) |
| Breadcrumbs | `breadcrumbs` | breadcrumb trail, path navigation, hierarchy trail | Sidebar (Source List), Tabs, Toolbar (Unified Title Bar), Site Header vs. Navigation Bar |
| Sticky vs. Fixed Positioning | `sticky-fixed` | sticky header, fixed header, pinned element | Toolbar (Unified Title Bar), Sidebar (Source List), Popover vs. Dropdown Menu vs. Tooltip, Site Header vs. Navigation Bar, Parallax Scrolling |
| Focus Ring (:focus-visible) | `focus-ring-web` | focus indicator, keyboard focus outline, focus halo | Form Field (Web), Focus Ring (macOS), Command Palette (Web), Switch vs. Checkbox vs. Radio (Web), Toggle Group/Segmented Control (Web) |
| Empty State | `empty-state` | blank state, zero state, first-use state, no-results state | Skeleton vs. Spinner, Toast (Snackbar), Command Palette |
| Hover Card | `hover-card` | hover preview, profile preview, preview card | Popover vs. Dropdown Menu vs. Tooltip, Combobox (Autocomplete / Typeahead), Focus Ring (:focus-visible), Popover (macOS) |
| Switch, Checkbox, Radio | `switch-checkbox-radio` | toggle switch, check box, radio button, option button | Toggle Group (Segmented Control), Badge vs. Chip vs. Pill vs. Tag, Focus Ring (:focus-visible), Segmented Control |
| Toggle Group (Segmented Control) | `toggle-group` | segmented control, button group, view switcher, segmented button | Tabs, Switch vs. Checkbox vs. Radio, Segmented Control (macOS), Badge vs. Chip vs. Pill vs. Tag |
| Toast (Snackbar) | `toast` | snackbar, status toast, in-app notification | Scrim (Backdrop / Overlay), Empty State, Popover vs. Dropdown Menu vs. Tooltip |

## Parallax Scrolling

**Slug:** `/web/parallax`

### API

`animation-timeline: scroll()`, `perspective + translateZ() + scale()`

### Aliases

parallax effect, parallax background, scroll-linked depth effect, fixed background

### Descripción

Capas que se trasladan a distinta velocidad durante el scroll para simular profundidad ("el fondo se mueve más lento que la página"). Si la imagen no se mueve y el contenido solo se desliza encima, es la variante de fondo fijo (background-attachment: fixed, ignorada por iOS Safari); un elemento que se queda quieto mientras el resto pasa es position: sticky, no parallax. El mecanismo moderno es la animación scroll-driven: animation-timeline: scroll() mapea la posición de scroll al progreso de la animación.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Background layer | `translateZ(-1px) scale(2)` |
| Foreground layer | `translateZ(0)` |

### Prompt de implementación

Build a parallax scrolling section: layered depth where the background layer translates slower than the foreground as the user scrolls. Drive it with CSS scroll-driven animations (animation-timeline: scroll() — declared AFTER the animation shorthand, which otherwise resets it) or with Motion's useScroll \+ useTransform from "motion/react"; animate only transform/opacity. Do not use background-attachment: fixed — iOS Safari ignores it by design. Wrap the whole effect in @media (prefers-reduced-motion: reduce) and fall back to ordinary scrolling; parallax is a known vestibular trigger.

### Prompt de debug

Debug my parallax scrolling (scroll-driven animation / perspective trick / ScrollTrigger). Rule out: jank from layout work inside a scroll handler or from animating background-position instead of transform; background-attachment: fixed silently ignored on iOS Safari (by design — use a sticky or transformed layer instead); position: fixed children breaking because a perspective/transform ancestor became their containing block; a scroll-driven animation never starting because animation-timeline was declared before the animation shorthand or the scroller has no scrollable overflow; horizontal overflow introduced by the perspective trick's scale compensation; the effect still moving under prefers-reduced-motion: reduce. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `animation-timeline: scroll()` | scroll-driven animation — progress follows the scrollbar; declare AFTER the animation shorthand |
| CSS | `perspective + translateZ() + scale()` | the classic pure-CSS depth trick — scale \= 1 \+ (−z / perspective) |
| Motion | `useScroll + useTransform` | import from "motion/react" (the library formerly named framer-motion) |
| GSAP | `ScrollTrigger { scrub: true }` | tween progress pinned to scroll progress |
| CSS | `background-attachment: fixed` | the fixed-background lookalike — still ignored by iOS Safari, by design |

### Ver también

Sticky vs. Fixed Positioning, Easing (Timing Function), Spring Animation

## Date Picker

**Slug:** `/web/date-picker`

### API

`<input type="date">`, `<DayPicker mode="range" />`

### Aliases

Calendar picker, calendar popup, calendar dropdown, date range picker, month view

### Descripción

El "calendarcito que aparece" sobre un campo de fecha es un date picker: el campo es el trigger, el mes flotante es el calendar popover y la grilla de días es un role="grid" cuyo día elegido lleva aria-selected. Al elegir dos extremos se convierte en date-range picker: el primero y el último día son range start y range end (range\_start / range\_end en react-day-picker) y la franja teñida entre ellos es el in-range span (range\_middle). Una grilla de mes sola es solo un calendar; el picker es el que está cableado a un campo.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Previous / next month buttons | `button_previous / button_next` |
| Range start / end | `range_start / range_end` |
| In-range span | `range_middle` |
| Today indicator | `today` |

### Prompt de implementación

Build a date picker: a date field that opens a calendar popover — the shadcn/ui pattern is Popover \+ Calendar, where Calendar wraps react-day-picker's DayPicker. For a date range use mode="range": the endpoints get the range\_start / range\_end modifiers and the tinted days between them are range\_middle. Treat dates as civil dates (yyyy-mm-dd strings), never Date-parsed-as-UTC (the classic off-by-one-day bug); start the week per the locale; keep the grid keyboard model (arrows move by day and week, PageUp/PageDown by month).

### Prompt de debug

Debug my date picker (react-day-picker / \<input type="date"\> / range mode). Rule out: the selected day rendering one day off because a date-only string was parsed as UTC and displayed in local time; the wrong month because JavaScript Date months are 0-based; range endpoints silently swapped or end-before-start allowed after a typed edit; the week starting on the wrong day for the locale; the calendar popover clipped by an overflow container, transform ancestor, or viewport edge; arrow keys dead because the grid lost its roving tabindex. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<input type="date">` | native control — value always yyyy-mm-dd |
| React | `<DayPicker mode="range" />` | react-day-picker — what shadcn/ui's wraps |
| Web API | `input.showPicker()` | opens native picker programmatically (needs user gesture) |
| ARIA | `role="grid"` | calendar grid; chosen day carries aria-selected="true" |
| SwiftUI | `.datePickerStyle(.graphical)` | SwiftUI DatePicker's inline calendar style |

### Ver también

Form Field, Popover vs. Dropdown Menu vs. Tooltip, Combobox (Autocomplete / Typeahead)

## Pagination

**Slug:** `/web/pagination`

### API

`<nav aria-label="pagination">`, `aria-current="page"`

### Aliases

pager, paging controls, page navigation, page numbers, page control

### Descripción

"Los botones numerados al pie de la lista" son pagination: un landmark nav de links de números de página con el actual marcado con aria-current="page". El "…" apretado entre números es el ellipsis (overflow indicator), y la fila de puntitos de una vista deslizable tiene su propio nombre: el page control (UIPageControl en Apple; en un carousel web, el slide picker). Si la lista solo crece al scrollear es infinite scroll, y el botón "Load more" es su primo — pagination es la de páginas numeradas y direccionables.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Page-number links | `aria-current="page"` |
| Previous / next links | `<PaginationPrevious />` |
| Ellipsis (overflow indicator) | `<PaginationEllipsis />` |
| Page dots (page control) | `UIPageControl` |

### Prompt de implementación

Build pagination for this list: a \<nav aria-label="pagination"\> landmark containing page-number links with the current one marked aria-current="page", previous/next links at the ends, and an ellipsis (…) standing in for the collapsed range (shadcn/ui \<Pagination\> with PaginationEllipsis). Keep the visible page 1-based and convert to 0-based offsets in exactly one place; whenever filters, totals, or page size change, recompute total pages and clamp the current page.

### Prompt de debug

Debug my pagination (aria-current="page", ellipsis window logic, page state). Rule out: 0-based and 1-based page indices mixed at a boundary — URL, component state, API offset — instead of converted in one place; the current page left outside the valid range after a filter or page-size change (clamp when totals change); ellipsis window logic hiding a page even though all pages fit, or showing … for a single hidden page (test totals just below, at, and above the truncation threshold); the highlighted number missing aria-current="page" so screen readers announce only "3, link"; page dots out of sync with the content because the dots and the slides track different indices.

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<nav aria-label="pagination">` | MDN recipe — nav landmark holding page links |
| ARIA | `aria-current="page"` | Marks the ONE current page link |
| shadcn/ui | `<Pagination />` | With PaginationPrevious / PaginationEllipsis / PaginationNext |
| UIKit | `UIPageControl` | Apple's name for the row of page dots |
| SwiftUI | `.tabViewStyle(.page)` | Paged TabView showing the dot index |

### Ver también

Carousel, Tabs, Truncation (Ellipsis & Line Clamp)

## Sign-in Form

**Slug:** `/web/sign-in-form`

### API

—

### Aliases

login form, login page, login screen, sign-in page, auth form, authentication form

### Descripción

Un sign-in form (login form para todo el mundo) es un conjunto de partes con nombres reales: el password visibility toggle, los federated sign-in buttons (botones de proveedor de identidad) y el sign-in method divider. Su parte más importante es invisible: autocomplete="username" y autocomplete="current-password" son lo que permite que los password managers y las passkeys completen el formulario.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Federated sign-in buttons | `"Continue with Google"` |
| Sign-in method divider | `"or"` |
| Password visibility toggle | `<button type="button">` |

### Prompt de implementación

Build a sign-in form (login form) with native form semantics: a real \<form\> containing a labeled email field (\<input type="email" autocomplete="username"\>), a labeled password field (\<input type="password" autocomplete="current-password"\>), and a \<button type="submit"\> labeled "Sign in" so Enter submits. Add the password visibility toggle as a \<button type="button"\> with accessible name "Show password"; put the federated sign-in buttons ("Continue with Google" / "Continue with Apple") above a sign-in method divider — the thin rule with "or" in the middle. The autocomplete tokens are load-bearing: they are what makes password managers recognize and fill the fields.

### Prompt de debug

Debug my sign-in form (autocomplete tokens, password managers, Enter submission). Rule out: the password manager not filling because the email field lacks autocomplete="username" or the password says new-password on a SIGN-IN form; Enter doing nothing because the inputs are not inside a real \<form\> with a \<button type="submit"\>; the eye toggle submitting the form because it is missing type="button"; mobile keyboards capitalizing the identifier because it is type="text" without autocapitalize="none"; framework state staying empty even though the browser autofilled the DOM (read values at submit time). The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `autocomplete="current-password"` | on the password input — what makes password managers offer to fill |
| HTML | `autocomplete="username"` | on the email/username field, even when it's type="email" |
| HTML | `<input type="password">` | — |
| HTML | `autocomplete="username webauthn"` | adds passkey autofill; webauthn goes last in the list |
| Web API | `navigator.credentials.get({ publicKey, mediation: "conditional" })` | passkey sign-in (conditional mediation) |

### Ver también

Form Field, Focus Ring (:focus-visible), Divider vs. Separator vs. Rule

## Carousel

**Slug:** `/web/carousel`

### API

`aria-roledescription="carousel"`

### Aliases

Slider, content slider, slideshow, image slider, swiper

### Descripción

"Esa cosa tipo card slider / carousel slider" es un carousel: una tira de slides que se pagina con botones previous/next o con los puntitos — que oficialmente se llaman slide picker controls. Si la tira se desplaza sola en loop infinito es un marquee, y si al clickear una miniatura la imagen se abre en grande sobre la página oscurecida es un lightbox; un carousel se queda en su lugar y muestra un slide a la vez.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Slide | `aria-roledescription="slide"` |
| Previous / next controls | `button aria-label="Next slide"` |
| Slide picker (the dots) | `role="tablist"` |

### Prompt de implementación

Build a carousel (content slider): a horizontal track of slides paged one at a time by previous/next buttons and slide picker dots, using scroll-snap-type: x mandatory or embla-carousel-react (what shadcn/ui's Carousel wraps). Wrap it in role="region" aria-roledescription="carousel"; each slide is a role="group" aria-roledescription="slide" with a position label like "2 of 3". No auto-rotation unless there is a visible pause control.

### Prompt de debug

Debug my carousel (embla-carousel-react / swiper / CSS scroll-snap). Rule out: slides overflowing because the track isn't display:flex with flex: 0 0 100% slides; scroll-snap fighting JS-driven transforms (pick ONE mechanism); the dots out of sync because the selected index listens to the wrong event; auto-rotation still running under prefers-reduced-motion or with no pause control; swipe dead because touch-action or pointer-events is blocked on the track. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| ARIA | `aria-roledescription="carousel"` | on a role="region" wrapper — the W3C name for the pattern |
| CSS | `scroll-snap-type: x mandatory` | the modern no-JS track |
| React | `embla-carousel-react` | what shadcn/ui's wraps |
| JS | `swiper` | the long-running library that popularized the pattern |

### Ver también

Marquee, Lightbox, Tabs, Pagination

## Site Header vs. Navigation Bar

**Slug:** `/web/header-navbar`

### API

`<header>`, `<nav>`

### Aliases

navbar, topbar, app bar, main navigation, page header

### Descripción

El navbar suele ser dos cosas anidadas. El site header es toda la franja superior — logo, links, búsqueda, sign-in — y en HTML es el a nivel de página, el landmark banner. La navigation bar propiamente dicha es solo el grupo de links de destino que va adentro: un elemento , con aria-current="page" marcando el link de la página en la que estás.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Site header | `<header>` |
| Navigation region | `<nav>` |
| Current-page link | `aria-current="page"` |

### Prompt de implementación

Build a site header with a navigation bar: a page-level \<header\> (the banner landmark) containing the brand mark, a \<nav aria-label="Main"\> wrapping only the row of destination links, and the actions on the right. Mark the link for the current page with aria-current="page" and style the current state off that attribute, not off a class.

### Prompt de debug

Debug my site header / navbar (\<header\>, \<nav\>, aria-current). Rule out: the whole header wrapped in \<nav\> so screen readers announce buttons and the logo as navigation (only the link group is \<nav\>); two unlabeled \<nav\> elements (give each an aria-label); the current-page style set by a class that fell out of sync with the route instead of aria-current="page"; the header overlapping content because it was made position: fixed without reserving its height.

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<header>` | page-level banner landmark |
| HTML | `<nav>` | only the group of destination links |
| ARIA | `aria-current="page"` | marks the link for the current page |
| ARIA | `role="banner"` | — |

### Ver también

Hamburger Menu (Nav Drawer), Sticky vs. Fixed Positioning, Breadcrumbs, Menu Bar

## Card

**Slug:** `/web/card`

### API

`<Card>`, `<article>`

### Aliases

tile, card component, content card, status card

### Descripción

"Esas cajas del dashboard" son cards, y cada región tiene nombre: la media arriba, el header con el título, el body, la fila de metadata y el footer con las acciones. "El chin gigante" es espacio muerto sobre el footer — no una parte sino un bug de sizing: cuando la grilla estira las cards a igual altura, un footer sin fijar deja que el hueco se acumule ahí (margin-top: auto lo arregla). No es el preview emergente que aparece sobre un link — eso es un hover card.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Card media | `usa-card__media` |
| Card header | `CardHeader / CardTitle` |
| Card body | `CardContent` |
| Metadata row | `<time> + CardDescription` |
| Card footer | `CardFooter` |

### Prompt de implementación

Build a card component: an \<article\> (or shadcn/ui \<Card\>) with an opaque background, one border radius, and stacked slots — media image, header with title, body text, a metadata row, and a footer with the actions. Make the card display:flex column with margin-top:auto on the footer so equal-height cards in a grid never grow a gap of dead space above the footer.

### Prompt de debug

Debug my card component (shadcn/ui Card / .card / \<article\>). Rule out: the 'massive chin' — dead space above the footer because grid/flex stretches cards to equal height while the footer isn't pinned with margin-top:auto in a flex-column card; the media corner poking out because the image ignores the card's border-radius (overflow:hidden or matching radius on the image); the whole card wrapped in \<a\> with more links nested inside (invalid HTML); text touching the media because padding lives on the wrong slot. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| shadcn/ui | `<Card>` | with CardHeader / CardContent / CardFooter slots |
| HTML | `<article>` | the semantic wrapper when the card stands alone |
| CSS | `margin-top: auto` | on the footer — THE fix for uneven card heights |
| Bootstrap | `.card` | — |

### Ver también

Bento Grid, Masonry Layout (Pinterest Grid), Hover Card, Skeleton vs. Spinner

## Resize Handle (Size Grip)

**Slug:** `/web/resize-handle`

### API

`resize`, `::-webkit-resizer`

### Aliases

size grip, resize grip, gripper, resizer, drag corner

### Descripción

"Las tres rayitas diagonales abajo a la derecha de un campo de texto" son el resize handle o size grip — la esquina estriada que se arrastra para redimensionar la caja. Los navegadores lo agregan automáticamente a ; la propiedad CSS resize lo controla y ::-webkit-resizer estiliza el pixel mismo. No confundirlo con un textarea auto-creciente (field-sizing: content) — comportamiento sin pixel que agarrar — ni con los handles cuadrados de selección de un editor canvas, que viven en la página de Drag and Drop.\</div\>\</body\>\</html\>

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Size grip | `::-webkit-resizer` |

### Prompt de implementación

Style the resize handle (size grip) of my textarea: the diagonal-ribbed corner browsers add by default. Control it with CSS resize (use resize: vertical so dragging can't break the layout horizontally, resize: none to remove it), set min-height/max-height bounds, and style the grip itself via ::-webkit-resizer where supported.

### Prompt de debug

Debug my textarea's resize handle (CSS resize, ::-webkit-resizer). Rule out: the grip missing because resize: none or overflow: visible is set (the grip needs overflow other than visible); dragging blowing up the layout because resize: both is allowed where resize: vertical was intended and no max-width/max-height bounds exist; the grip invisible on a dark theme because ::-webkit-resizer wasn't restyled; Firefox ignoring ::-webkit-resizer (it draws its own grip — don't rely on styling it). The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `resize` | resize: vertical keeps a textarea from breaking your layout sideways |
| CSS | `::-webkit-resizer` | the grip pixel itself — styleable in WebKit/Blink |
| HTML | `<textarea>` | grows the grip by default in most browsers |
| CSS | `field-sizing: content` | the AUTO-growing alternative — behavior, not this pixel |

### Ver también

Form Field (Web), Drag & Drop (Web)

## Hamburger Menu (Nav Drawer)

**Slug:** `/web/hamburger-menu`

### API

`aria-expanded + aria-controls`, `<nav>`

### Aliases

navigation drawer, hamburger button, side menu, off-canvas menu

### Descripción

"Las tres líneas horizontales que abren un menú" son un hamburger button, y el panel que se desliza es un navigation drawer. El botón es solo el trigger — tres líneas apiladas, usualmente arriba a la izquierda en teléfonos; el drawer es un off-canvas que se desliza sobre la página por encima de un scrim. Los hermanos del ícono (puntos, ellipsis) viven en The Three Dots; esta página es el patrón de navegación ícono-más-drawer en sí.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Hamburger button | `aria-expanded` |
| Navigation drawer | `Sheet side="left"` |

### Prompt de implementación

Build a hamburger menu: a \<button aria-expanded aria-controls\> drawing three stacked lines that toggles a navigation drawer — an off-canvas \<nav\> panel sliding in from the left over a scrim (shadcn Sheet side="left", Material NavigationDrawer). Lock body scroll while open, close on Escape and scrim tap, keep aria-expanded in sync, and return focus to the button on close.

### Prompt de debug

Debug my hamburger menu (aria-expanded toggle \+ off-canvas \<nav\> drawer). Rule out: the drawer rendering under the scrim or page header (z-order); body still scrolling behind the open drawer; aria-expanded never flipping so screen readers see a dead button; focus staying lost in the drawer after close instead of returning to the button; the drawer animating from the wrong edge because translate-x sign flipped; the menu unreachable on desktop because the toggle is hidden above the breakpoint but the nav links never reappear. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| ARIA | `aria-expanded + aria-controls` | the toggle button's contract |
| HTML | `<nav>` | the drawer content is navigation |
| shadcn/ui | `Sheet side="left"` | the usual React building block |
| Material | `NavigationDrawer` | Android/Material's name for the panel |

### Ver también

The Three Dots (Overflow Menu), Modal Dialog vs. Drawer vs. Sheet, Scrim (Backdrop / Overlay), Site Header vs. Navigation Bar

## Bento Grid

**Slug:** `/web/bento-grid`

### API

`display: grid + grid-column: span 2`

### Aliases

Bento box layout, feature grid, dashboard grid

### Descripción

Una sola grilla CSS donde los tiles ocupan distinta cantidad de celdas, de modo que un hero tile queda entre tiles chicos como los compartimentos de una lunchbox japonesa. Las páginas de marketing de Apple hicieron famoso el estilo. La señal frente a una grilla de cards común es el spanning: al menos un tile toma 2×2 o 2×1 celdas mientras todo sigue alineado a los mismos tracks y al mismo gap.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Spanning tile | `grid-column: span 2` |
| Gap (gutter) | `gap` |

### Prompt de implementación

Build a bento grid: one CSS grid (display: grid; grid-template-columns: repeat(4, 1fr); one consistent gap) where feature tiles span multiple cells via grid-column: span 2 / grid-row: span 2, every tile shares the same corner radius and an opaque background, and the whole composition reads as a single rounded box of differently sized compartments.

### Prompt de debug

Debug my bento grid (CSS grid with spanning tiles). Rule out: holes in the grid because a span exceeds the remaining columns in its row (consider grid-auto-flow: dense, noting it reorders visually vs DOM); uneven gutters from per-tile margins instead of the grid's single gap; tiles with different corner radii or translucent backgrounds breaking the lunchbox look; the hero tile collapsing on small screens because the span isn't reduced under a media query. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `display: grid + grid-column: span 2` | spanning cells are what make a grid a bento |
| CSS | `grid-template-columns: repeat(4, 1fr)` | the fixed track skeleton the spans play against |
| CSS | `grid-template-areas` | name the tiles instead of counting spans |
| Tailwind | `col-span-2 row-span-2` | — |

### Ver también

Masonry Layout (Pinterest Grid), Drag & Drop, Card

## Masonry Layout (Pinterest Grid)

**Slug:** `/web/masonry`

### API

`grid-template-rows: masonry`

### Aliases

Waterfall layout, pinterest grid, brick layout

### Descripción

La grilla estilo Pinterest donde cada tarjeta conserva su propia altura: cada ítem nuevo se suma a la columna más corta, y las tarjetas se empaquetan como ladrillos, sin líneas de fila y con un borde inferior escalonado. Las UIs chinas lo llaman 瀑布流 (waterfall flow). Hoy CSS columns lo aproxima en todos lados; el masonry nativo (Grid Lanes) llegó en Safari 26\.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Packed column | `columns / grid track` |

### Prompt de implementación

Build a masonry layout (Pinterest-style): native CSS first — \`@supports (grid-template-rows: masonry) { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: masonry; }\` — with a CSS multi-column fallback (\`columns: 3; every card break-inside: avoid\`). Note the fallback orders items down each column, not across rows; if strict left-to-right order matters, use react-masonry-css instead. Reserve image aspect ratios so cards don't jump while loading.

### Prompt de debug

Debug my masonry layout (CSS columns fallback / grid-template-rows: masonry). Rule out: cards splitting across columns because break-inside: avoid is missing; item order reading down the first column when the design expects row-major; equal-height rows appearing because the browser lacks native masonry and there's no @supports fallback; the wall reshuffling as images load because width/height aren't reserved; margins on cards fighting the column-gap. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `columns` | Works everywhere today — but items flow DOWN each column, not across rows |
| CSS | `grid-template-rows: masonry` | Native (Grid Lanes): Safari 26; behind flags elsewhere in 2026 — pair with @supports |
| React | `react-masonry-css` | JS split into per-column stacks when row-major order matters |
| CSS | `break-inside: avoid` | Stops cards splitting across columns in the fallback |

### Ver también

Bento Grid, Lightbox, Card

## Easing (Timing Function)

**Slug:** `/web/easing`

### API

`transition-timing-function`, `cubic-bezier(.4, 0, .2, 1)`

### Aliases

timing function, easing curve, bezier curve

### Descripción

"La animación se siente robótica" es casi siempre el easing: la timing function, la curva que mapea tiempo a progreso. Linear se mueve a velocidad constante; ease-out arranca rápido y aterriza suave; ease-in-out es la curva en S por defecto del movimiento de UI. Los cuatro números de cubic-bezier() son los dos puntos de control de ese gráfico.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Timing curve | `cubic-bezier(x1, y1, x2, y2)` |

### Prompt de implementación

Fix the easing of my animation: replace linear/default timing with an explicit curve — transition-timing-function: cubic-bezier(.4, 0, .2, 1\) for UI moves (fast start, soft landing), ease-out for things entering, ease-in for things leaving; keep durations 150–300ms for interface transitions and never animate at linear speed unless it's a marquee-style continuous loop.

### Prompt de debug

Debug the feel of my animation (CSS transition-timing-function / cubic-bezier). Rule out: no timing function set so it falls back to the default ease; linear timing making UI motion feel robotic; ease-in on an ENTERING element (arrivals want ease-out — decelerate into place); a cubic-bezier with y values outside 0–1 clipping instead of overshooting in transition shorthand order; duration so long the curve reads as lag. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `transition-timing-function` | ease, ease-in, ease-out, ease-in-out, linear |
| CSS | `cubic-bezier(.4, 0, .2, 1)` | a custom curve — the four numbers are the two control points |
| CSS | `linear(…)` | piecewise curves beyond beziers (springs, bounces); baseline since 2023 |
| Motion | `transition={{ ease: "easeInOut" }}` | — |

### Ver también

Spring Animation, Marquee, Parallax Scrolling

## Spring Animation

**Slug:** `/web/spring`

### API

`transition={{ type: "spring", stiffness, damping }}`

### Aliases

spring physics, bouncy animation, spring transition

### Descripción

"Rebota un poco más allá de donde aterriza" es una spring animation: movimiento gobernado por física (stiffness, damping, mass) en lugar de una duración y una curva. La firma es el overshoot: el elemento pasa su objetivo y se asienta de vuelta. Los springs además cambian de objetivo en pleno vuelo con gracia, por eso las UIs guiadas por gestos los usan.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Overshoot | `damping` |

### Prompt de implementación

Give this animation spring physics: use Motion's transition={{ type: "spring", stiffness: 300, damping: 22 }} (or react-spring) instead of a duration+easing pair — the element should slightly overshoot its target and settle; raise damping to kill wobble, raise stiffness for snap. For pure CSS, bake the spring into a linear() timing function.

### Prompt de debug

Debug my spring animation (Motion type: "spring", react-spring, CSS linear()). Rule out: damping too low so it wobbles like jelly; stiffness too low so it feels underwater; a duration fighting the physics (springs compute their own settle time); the overshoot clipped by an overflow-hidden parent; interruptions snapping because the spring restarts from the target instead of retargeting from current velocity. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| Motion | `transition={{ type: "spring", stiffness, damping }}` | no duration — the physics decide when it stops |
| CSS | `linear(…)` | a spring baked into keypoints — springs as pure CSS |
| React | `react-spring` | — |
| SwiftUI | `.spring(response:dampingFraction:)` | the same idea on Apple platforms |

### Ver también

Easing (Timing Function), Toast (Snackbar), Parallax Scrolling

## Text Scramble (Decode Effect)

**Slug:** `/web/text-scramble`

### API

`ScrambleTextPlugin`, `requestAnimationFrame + charset swap`

### Aliases

decode effect, matrix text effect, shuffle text

### Descripción

"Las letras se barajan hasta deletrear la palabra" es un text scramble, también llamado efecto decode o Matrix: cada carácter pasa por glifos aleatorios y luego se fija en su lugar, normalmente de izquierda a derecha. La herramienta clásica es ScrambleTextPlugin de GSAP (gratis desde 3.13); las versiones a mano son un loop de requestAnimationFrame con un plazo de asentamiento por carácter.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Glyph churn | `chars (ScrambleTextPlugin)` |

### Prompt de implementación

Build a text scramble (decode) effect: each character cycles random glyphs and locks into the real one left to right (GSAP ScrambleTextPlugin, or a requestAnimationFrame loop with a per-character settle deadline). Use a monospace font or tabular glyphs so width never jitters, expose the final string via aria-label with the churning span aria-hidden, and honor prefers-reduced-motion by rendering the text instantly.

### Prompt de debug

Debug my text scramble effect (GSAP ScrambleTextPlugin / rAF charset loop). Rule out: layout jitter because glyph widths differ (needs monospace or tabular-nums); the animation never settling because the per-character deadline keeps resetting on re-render; screen readers announcing garbage (final text must live in aria-label, churn aria-hidden); the effect re-running on every state change instead of once per mount; reduced-motion users getting the churn instead of instant text. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| GSAP | `ScrambleTextPlugin` | the canonical implementation — free since GSAP 3.13 |
| JS | `requestAnimationFrame + charset swap` | the hand-rolled version: per-character reveal deadline, random glyphs until then |
| CSS | `font-variant-numeric: tabular-nums` | monospace/tabular glyphs stop the line jittering while it churns |
| A11y | `aria-label + aria-hidden churn` | screen readers get the final text, never the noise |

### Ver también

Marquee, Skeleton vs. Spinner

## Lightbox

**Slug:** `/web/lightbox`

### API

`<dialog>`, `::backdrop`

### Aliases

image viewer overlay, photo modal, gallery overlay

### Descripción

"Hacés clic en la foto y se abre en grande con todo oscuro detrás" es un lightbox: un visor de imágenes modal superpuesto a la página. La capa oscura detrás es el scrim, la imagen ampliada ocupa el centro de la escena y las flechas pasan por la galería. Los lightboxes modernos se construyen sobre el elemento nativo `<dialog>` y su `::backdrop`.

### Anatomía

—

### Prompt de implementación

Build a lightbox: clicking a gallery thumbnail opens the full image in a modal \<dialog\> (aria-modal) over a dark ::backdrop scrim, with prev/next arrows, a close button, Escape and backdrop-click to dismiss, and a reversible fade/scale transition.

### Prompt de debug

Debug my lightbox (\<dialog\>, ::backdrop, PhotoSwipe-style image overlay). Rule out: opened with show() instead of showModal() so there is no backdrop and the page scrolls behind; arrow keys paging the gallery and scrolling the page at the same time; the full-size image loading only after the transition so it pops from blurry to sharp; focus not returning to the clicked thumbnail on close. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<dialog>` | the modern base layer for a lightbox |
| CSS | `::backdrop` | — |
| ARIA | `role="dialog" aria-modal="true"` | — |
| JS libs | `PhotoSwipe · GLightbox` | ready-made lightbox libraries |

### Ver también

Scrim (Backdrop / Overlay), Modal Dialog vs. Drawer vs. Sheet

## Marquee

**Slug:** `/web/marquee`

### API

`animation` \+ `@keyframes translateX` *(tomado de los metadatos de la página)*

### Aliases

ticker, logo carousel, auto-scrolling strip *(tomados de los metadatos de la página)*

### Descripción

Contenido que se auto-desplaza lateralmente en un loop infinito — "los logos que se deslizan solos". Toma su nombre del tag obsoleto `<marquee>`. Si el usuario lo pagina con flechas o dots, es un carousel, no un marquee.

### Anatomía

—

### Prompt de implementación

—

### Prompt de debug

—

### In code

—

### Ver también

—

*Nota de relevamiento: el cuerpo de esta página no pudo extraerse vía fetch (solo se recuperaron título, descripción y metadatos, en 9+ intentos). API y Aliases provienen de los metadatos de la propia página; Anatomía, Prompts, In code y Ver también deben completarse manualmente desde [https://namethatui.com/web/marquee](https://namethatui.com/web/marquee).*

## Form Field

**Slug:** `/web/form-field`

### API

`<label for>`, `::placeholder`

### Aliases

Text field, input field, form input, form control

### Descripción

"El texto gris dentro de la caja que desaparece cuando escribís" es el placeholder, una de las cinco partes de un form field que tienen nombre propio: la palabra sobre la caja es el label (`<label for>`), la estrellita roja es el required indicator, la línea gris chica de abajo es el helper text y la línea roja que lo reemplaza es el validation message. Cablearlos (for/id, aria-describedby, aria-invalid) es lo que hace el campo usable con lectores de pantalla, no solo para usuarios videntes.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Label | `<label for="…">` |
| Required indicator | `required` |
| Placeholder | `::placeholder` |
| Helper text | `aria-describedby` |
| Error message | `aria-invalid="true"` |

### Prompt de implementación

Build the form field with full anatomy: a real \<label for\> above the input (clicking it focuses the field), placeholder text as a hint only — never as the label, helper text below linked via aria-describedby, and required marked with the required attribute plus a visual asterisk. On invalid input set aria-invalid="true", style the red state with :user-invalid, and point aria-describedby at the error message.

### Prompt de debug

Debug my form field (label for/id, aria-describedby, placeholder). Rule out: the placeholder doing the label's job and vanishing on first keystroke; the label not associated so clicking it does not focus the input; error text not linked via aria-describedby so screen readers never hear it; autofill's yellow/blue fill overriding your styles (-webkit-autofill). The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<label for>` | — |
| CSS | `::placeholder` | — |
| ARIA | `aria-describedby` | links helper/error text to the input |
| ARIA | `aria-invalid` | — |
| CSS | `:user-invalid` | invalid only after interaction |
| HTML | `required` | — |

### Ver también

Focus Ring (:focus-visible), Combobox (Autocomplete/Typeahead), Switch vs. Checkbox vs. Radio

## Truncation (Ellipsis & Line Clamp)

**Slug:** `/web/truncation`

### API

`text-overflow: ellipsis`, `-webkit-line-clamp`

### Aliases

ellipsis, text overflow, line clamp, clamped text, truncated text

### Descripción

"El texto que se corta con tres puntitos" es truncation, y los puntos son un ellipsis (…, un solo carácter, no tres puntos). El corte al final de línea es `text-overflow: ellipsis`; cortar después de N líneas es un line clamp; los puntos en el medio de un nombre de archivo largo son middle truncation — nativo en macOS, JS en la web. No confundirlo con el botón de menú overflow ⋯: mismos puntos, trabajo completamente distinto.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| End ellipsis | `text-overflow: ellipsis` |
| Line clamp | `-webkit-line-clamp` |
| Middle truncation | `NSLineBreakMode.byTruncatingMiddle` |
| Fade-out (soft truncation) | `mask-image` |

### Prompt de implementación

Truncate the text with CSS. Single line: overflow: hidden; white-space: nowrap; text-overflow: ellipsis. Multi-line: display: \-webkit-box; \-webkit-box-orient: vertical; \-webkit-line-clamp: 2; overflow: hidden (unprefixed line-clamp isn't safe in all browsers yet). Middle truncation that preserves the file extension needs JS on the web — on macOS it's lineBreakMode \= .byTruncatingMiddle. For a soft fade-out instead of dots, use mask-image: linear-gradient(to right, black 70%, transparent).

### Prompt de debug

Debug my text truncation (text-overflow ellipsis, line-clamp). Rule out: ellipsis needing all three of overflow hidden, white-space nowrap, and a real width constraint — in flex rows add min-width:0 to the shrinking child, that is the classic; multi-line needing \-webkit-line-clamp with \-webkit-box; middle truncation (file names) needing JS, CSS cannot do it; the full text unavailable because no title/tooltip reveals it. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `text-overflow: ellipsis` | — |
| CSS | `-webkit-line-clamp` | — |
| CSS | `white-space: nowrap` | required for single-line ellipsis |
| AppKit | `NSLineBreakMode.byTruncatingMiddle` | middle truncation is native on macOS |
| CSS | `mask-image` | the fade-out alternative |

### Ver también

The Three Dots (Overflow Menu), Breadcrumbs, Marquee, Pagination

## Drag & Drop

**Slug:** `/web/drag-and-drop`

### API

`ondrop`, `ondragover`

### Aliases

drag and drop, drag-and-drop interaction, direct manipulation, sortable drag

### Descripción

Drag and drop permite mover o colocar un objeto de forma directa. Un grip indica dónde agarrar, un drag preview sigue al puntero, y una línea de inserción o un destino resaltado previsualizan el destino antes de soltar. Los selection resize handles son controles relacionados alrededor de un objeto seleccionado: lo redimensionan en vez de moverlo.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Drag handle (grip) | `draggable="true"` |
| Selection resize handles | `pointer events` |
| Drop indicator (insertion line) | `ondragover` |
| Drop-target highlight | `ondragover` |
| Drag preview (ghost) | `DataTransfer.setDragImage()` |

### Prompt de implementación

Build a Drag & Drop interaction with HTML draggable, ondragover, and ondrop (or @dnd-kit/core): show a drag handle, selection resize handles where applicable, a drag preview, and an insertion line or highlighted drop target before release. Do not use the deprecated aria-grabbed state; announce the picked-up item, available destination, and drop result through an ARIA live region.

### Prompt de debug

Debug my drag and drop (HTML draggable, ondragover/ondrop, dnd-kit). Rule out: drop never firing because dragover does not call preventDefault — that is the classic; dragleave firing when entering child elements so the highlight flickers — keep an enter/leave counter; setDragImage ignored because the ghost element is not in the DOM; touch devices doing nothing because native HTML5 DnD has no touch events — use a pointer-based library. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `ondrop` | — |
| HTML | `ondragover` | — |
| HTML | `draggable="true"` | — |
| ARIA | `aria-grabbed` | deprecated; announce drag state and drop results with live regions instead |
| dnd-kit | `@dnd-kit/core` | — |

### Ver también

Split View, Focus Ring (:focus-visible), The Three Dots (Overflow Menu)

## Divider vs. Separator vs. Rule

**Slug:** `/web/divider`

### API

`<hr>`, `role="separator"`, `css border`

### Aliases

separator, rule, horizontal rule, visual divider

### Descripción

Una horizontal rule marca un cambio de tema en el contenido, por eso HTML le da el elemento semántico `<hr>`. Un separator divide grupos de controles o regiones y puede usar role="separator" cuando ningún elemento semántico nativo encaja. Si la línea es solo estilo visual, es un border de CSS y no debería anunciarse como elemento. Divider de SwiftUI y los ítems separadores de menú de AppKit son los primos conocidos de macOS.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Thematic break (horizontal rule) | `<hr>` |
| Semantic separator | `role="separator"` |
| Decorative CSS border | `border-block-start` |
| macOS divider and separator item | `Divider / NSMenuItem.separator()` |

### Prompt de implementación

Choose the correct Divider, Separator, or Rule: use HTML \<hr\> for a semantic thematic break in content, role="separator" for a structural boundary between groups of controls, and a CSS border such as border-block-start for a purely decorative line. On macOS, use SwiftUI Divider for a visual division or NSMenuItem.separator() between menu-item groups.

### Prompt de debug

Debug my divider (hr, role=separator, border utilities). Rule out: the hairline doubling or vanishing on fractional zoom because 1px borders round differently; a decorative divider still announced by screen readers — decorative ones need aria-hidden, semantic ones role=separator; a flex parent stretching the divider when a fixed cross-size was intended; margin collapse eating the space around an hr. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<hr>` | — |
| ARIA | `role="separator"` | — |
| CSS | `border-block-start` | decorative only |
| SwiftUI | `Divider` | — |
| AppKit | `NSMenuItem.separator()` | — |

### Ver también

Menu Bar (macOS), Context Menu (macOS), Split View (macOS), The Three Dots (Overflow Menu) (Web), Sign-in Form (Web)

## Progress Ring vs. Spinner vs. Progress Bar

**Slug:** `/web/progress-indicators`

### API

`<progress>`, `ProgressView`

### Aliases

circular progress indicator, loading spinner, determinate progress indicator, linear progress indicator

### Descripción

Un spinner se repite en bucle sin mostrar cuánto trabajo queda. Un anillo de progreso determinado llena un arco alrededor de un círculo, mientras que una barra de progreso lineal se llena a lo largo de una pista; ambos representan un valor conocido. Una etiqueta de porcentaje puede hacer exacto ese valor, pero debe coincidir con el valor de progreso accesible del indicador.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Indeterminate spinner | `role="progressbar"` |
| Determinate progress ring | `aria-valuenow` |
| Linear progress bar | `<progress>` |
| Progress track | `<progress>` |
| Percentage label | `aria-valuenow` |

### Prompt de implementación

Use the correct Progress Indicator: an indeterminate spinner when the remaining work is unknown, a determinate progress ring when a compact circular arc should fill toward completion, or an HTML \<progress\> linear bar when there is room for a readable track. For a custom indicator use role="progressbar" with aria-valuenow, and expose any visible percentage as the same accessible value; SwiftUI's cousin is ProgressView.

### Prompt de debug

Debug my progress indicator (role=progressbar, aria-valuenow, spinner). Rule out: an indeterminate spinner where a determinate bar was possible (or vice versa); the bar width not animating because the transition is on the wrong property; the loading flag stuck true so the spinner never stops; aria-valuenow never updating so assistive tech hears 0 percent forever. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<progress>` | — |
| SwiftUI | `ProgressView` | — |
| ARIA | `role="progressbar"` | — |
| ARIA | `aria-valuenow` | — |

### Ver también

Skeleton vs. Spinner, Marquee

## The Three Dots (Overflow Menu)

**Slug:** `/web/three-dots`

### API

`<button>`, `aria-haspopup="menu"`

### Aliases

kebab menu, meatball menu, hamburger menu, overflow menu, more menu, ellipsis button

### Descripción

Tres puntos horizontales suelen llamarse meatballs y tres verticales kebab; ambos normalmente abren un menú de desbordamiento o "More" con acciones secundarias. Tres líneas horizontales son un botón hamburguesa y suelen abrir la navegación, a menudo en un drawer. Una elipsis dentro de una etiqueta como "Open…" es puntuación, no un ícono de overflow: indica que el comando necesita más datos antes de completarse.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Horizontal dots (meatballs / More) | `button[aria-haspopup="menu"]` |
| Vertical dots (kebab menu) | `button[aria-haspopup="menu"]` |
| Three lines (hamburger menu) | `button[aria-controls]` |
| Command ellipsis | `<button>Open…</button>` |

### Prompt de implementación

Use the correct three-mark control: a horizontal ellipsis (meatballs) or vertical ellipsis (kebab) button with aria-haspopup="menu" for a contextual Overflow/More menu; a three-line hamburger button with aria-controls for a navigation drawer; or an ellipsis inside a command label such as "Open…" only when the command asks for more input before completing.

### Prompt de debug

Debug my three-dots menu (kebab/meatballs, menu button). Rule out: the icon-only button missing an aria-label; the menu staying open after an item is chosen; outside-click and Escape not closing it; a hit target well under 24px so taps miss on mobile. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<button>` | — |
| ARIA | `aria-haspopup="menu"` | — |
| ARIA | `aria-expanded="true|false"` | — |
| CSS | `text-overflow: ellipsis` | unrelated truncation ellipsis |

### Ver también

Truncation (Ellipsis & Line Clamp), Popover vs. Dropdown Menu vs. Tooltip, Modal Dialog vs. Drawer vs. Sheet, Context Menu, Scrim (Backdrop / Overlay), Hamburger Menu (Nav Drawer)

## Modal Dialog vs. Drawer vs. Sheet

**Slug:** `/web/dialog-drawer-sheet`

### API

`<dialog>`, `HTMLDialogElement.showModal()`

### Aliases

modal, side panel, slide-over, bottom sheet

### Descripción

Un modal dialog está centrado, bloquea la interfaz subyacente y conviene para una decisión corta o una tarea enfocada. Un drawer se desliza desde un borde lateral y conserva más contexto visual para navegar o editar. Un sheet también se adhiere a un borde, casi siempre subiendo desde abajo para acciones compactas o layouts móviles; los tres necesitan cierre explícito y foco gestionado cuando son modales.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Modal surface | `<dialog>` |
| Scrim | `::backdrop` |

### Prompt de implementación

Use a Modal Dialog built with \<dialog\> and open it with HTMLDialogElement.showModal() so the browser places it in the top layer, makes the page behind it inert, provides ::backdrop, and supports Escape. Use a side Drawer for contextual editing or a bottom Sheet for compact/mobile actions; add a scrim and modal focus management only when those surfaces are actually modal.

### Prompt de debug

Debug my dialog/drawer/sheet (HTMLDialogElement, Radix Dialog, vaul). Rule out: show() used where showModal() was needed so there is no backdrop and no inert background; body scroll not locked so the page scrolls behind; focus not returned to the trigger on close; Escape closing it because onCancel is unhandled when you wanted it blocked; a nested dialog closing its parent. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<dialog>` | — |
| HTML | `HTMLDialogElement.showModal()` | — |
| ARIA | `role="dialog"` | — |
| Radix | `Dialog` | — |
| shadcn/ui | `Sheet` | — |

### Ver también

Scrim (Backdrop / Overlay), Popover vs. Dropdown Menu vs. Tooltip, Sheet (macOS), Sidebar (Source List), Lightbox, Hamburger Menu (Nav Drawer)

## Popover vs. Dropdown Menu vs. Tooltip

**Slug:** `/web/popover-dropdown-tooltip`

### API

`role="tooltip"`

### Aliases

popup, menu, hover hint, toggletip

### Descripción

Un popover se abre con clic y puede contener texto enriquecido, controles o formularios; permanece hasta que se lo descarta explícita o externamente. Un dropdown menu también se abre con clic, pero presenta una lista de acciones navegable por teclado y normalmente se cierra tras la selección. Un tooltip es una etiqueta breve y no interactiva que aparece al hacer hover o enfocar con teclado y desaparece al abandonar ese trigger.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Overlay trigger | `popovertarget` |
| Menu selection highlight | `role="menuitem"` |
| Tooltip arrow | `Tooltip.Arrow` |

### Prompt de implementación

Use the HTML popover attribute for the click-triggered rich overlay, role="menu" for the keyboard-navigable action list, and role="tooltip" only for a brief non-interactive hover or focus hint. Link the tooltip from its trigger with aria-describedby, keep every overlay anchored to its trigger, and implement the correct Escape, outside-click, and focus-dismissal behavior for each pattern.

### Prompt de debug

Debug my popover/dropdown/tooltip (Popover API, Radix, floating-ui). Rule out: the wrong primitive — tooltips are hover+focus, never interactive content; the panel clipped by an overflow ancestor instead of portaled to body or using the top-layer Popover API; flip/shift middleware missing so it overflows at viewport edges; outside-click closing it before the inside click registers.

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `popover` | — |
| ARIA | `role="tooltip"` | — |
| ARIA | `role="menu"` | — |
| Radix | `Popover` | — |
| Radix | `DropdownMenu` | — |
| Radix | `Tooltip` | — |

### Ver también

Modal Dialog vs. Drawer vs. Sheet, Hover Card, Context Menu, Popover

## Scrim (Backdrop / Overlay)

**Slug:** `/web/scrim`

### API

`::backdrop`

### Aliases

backdrop, overlay, modal overlay

### Descripción

Un scrim es la capa translúcida de área completa entre una superficie modal abierta y el contenido detrás. Reduce el contraste del fondo, evita interacciones accidentales y hace obvia la capa activa. Los diálogos HTML nativos exponen esta capa como el pseudo-elemento ::backdrop.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Dim layer | `::backdrop` |
| Backdrop blur | `backdrop-filter` |
| Light-dismiss area | `HTMLDialogElement.close()` |

### Prompt de implementación

Add a scrim behind the modal using the \<dialog\>::backdrop pseudo-element. It should cover the viewport, dim and optionally blur the page, intercept pointer input, and fade reversibly with the modal.

### Prompt de debug

Debug my scrim/backdrop (::backdrop, fixed overlay). Rule out: scrolling chaining through to the page — set overscroll-behavior contain and lock body scroll; the scrim stacking under content because a transformed ancestor created its own stacking context; pointer-events still active while it fades out so it eats clicks invisibly; the dialog ::backdrop unstylable because the dialog was opened with show() not showModal().

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `::backdrop` | — |
| HTML | `<dialog>` | — |
| CSS | `backdrop-filter` | — |

### Ver también

Modal Dialog vs. Drawer vs. Sheet, Popover vs. Dropdown Menu vs. Tooltip, Visual Effect Material (Vibrancy), Lightbox

## Skeleton vs. Spinner

**Slug:** `/web/skeleton-spinner`

### API

`aria-busy="true"`

### Aliases

skeleton screen, placeholder loader, loading spinner, throbber

### Descripción

Un skeleton anticipa la geometría del contenido que aún no llegó, reduciendo el layout shift y haciendo que una página predecible se sienta más rápida. Un spinner comunica una espera indeterminada cuando la forma final es desconocida o la operación está desligada de un layout específico. Ninguno de los dos debería permanecer una vez disponible el resultado o el estado de error.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Skeleton block | `Skeleton` |
| Skeleton text line | `Skeleton` |
| Shimmer sweep | `@keyframes` |
| Spinner track and arc | `role="status"` |

### Prompt de implementación

Mark the loading region aria-busy="true" and use a skeleton when the final card layout is known, preserving its geometry while data arrives. Use a spinner with role="status" when the wait has no meaningful content shape, and replace either indicator when loading completes.

### Prompt de debug

Debug my skeleton/spinner (loading placeholders). Rule out: skeleton flashing for sub-200ms loads — add an appearance delay; the shimmer looping forever because the error state never replaces it; skeleton shapes not matching real content so the swap causes layout shift; dozens of simultaneously animating placeholders janking scroll. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| ARIA | `aria-busy="true"` | — |
| shadcn/ui | `Skeleton` | — |
| ARIA | `role="status"` | — |

### Ver también

Empty State, Toast (Snackbar), Focus Ring (:focus-visible), Text Scramble (Decode Effect)

## Combobox (Autocomplete / Typeahead)

**Slug:** `/web/combobox`

### API

`role="combobox"`, `role="listbox"`

### Aliases

autocomplete, typeahead, search select, editable dropdown

### Descripción

Un combobox combina un campo de texto editable con una lista emergente de valores coincidentes. Escribir acota las opciones mientras las teclas de flecha mueven la opción activa y Enter la confirma. A diferencia de un select simple, admite búsqueda o entrada libre según las reglas del producto.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Combobox input | `role="combobox"` |
| Listbox popup | `role="listbox"` |
| Active option | `aria-activedescendant` |
| Selected-option checkmark | `aria-selected` |

### Prompt de implementación

Build a labelled Combobox with role="combobox" and a controlled role="listbox" popup. Keep aria-expanded and aria-controls in sync, give each result role="option", retain DOM focus in the input with aria-activedescendant, and support Arrow keys, Enter, and Escape without autofocusing on mount.

### Prompt de debug

Debug my combobox (role=combobox, aria-activedescendant, cmdk/Radix). Rule out: the listbox closing on blur before the option click lands — handle selection on pointerdown or check relatedTarget; the highlighted index not resetting when the filter changes; aria-activedescendant pointing at a filtered-out option id; the mobile keyboard covering the list because nothing scrolls the field into view. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| ARIA | `role="combobox"` | — |
| ARIA | `role="listbox"` | — |
| ARIA | `aria-expanded` | — |
| ARIA | `aria-controls` | — |
| ARIA | `aria-activedescendant` | — |
| HTML | `<datalist>` | a native limited alternative |

### Ver también

Command Palette (Web), Pop-Up Button vs. Pull-Down Button vs. Combo Box (macOS), Popover vs. Dropdown Menu vs. Tooltip (Web)

## Command Palette

**Slug:** `/web/command-palette`

### API

`role="dialog"`

### Aliases

command menu, quick actions, launcher, command bar

### Descripción

Un command palette es un overlay orientado al teclado que busca acciones, páginas y objetos desde un solo lugar. Suele abrirse con ⌘K o Ctrl+K, resalta un resultado a la vez y ejecuta el comando seleccionado con Enter. Es más amplio que un combobox porque lanza comandos heterogéneos en lugar de elegir el valor de un campo.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Command input | `CommandInput` |
| Command group | `CommandGroup` |
| Active command | `CommandItem` |
| Command shortcut | `CommandShortcut` |

### Prompt de implementación

Add a Command Palette using the shadcn/ui Command component inside a role="dialog", opened by ⌘K or Ctrl+K. Filter actions as the user types, support arrow-key selection and Enter, and restore focus to the invoking control on dismissal.

### Prompt de debug

Debug my command palette (cmdk, Dialog \+ Command). Rule out: the cmd/ctrl-K listener attached to the wrong scope or eaten by the browser; the filter state persisting from the previous open — reset on open; focus escaping the dialog because the trap ignores portaled content; keydown firing during IME composition (check isComposing); the palette rendered under a higher stacking context. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| shadcn/ui | `Command` | — |
| ARIA | `role="dialog"` | — |
| ARIA | `role="combobox"` | — |
| Radix | `Dialog` | — |

### Ver también

Combobox (Autocomplete / Typeahead), Modal Dialog vs. Drawer vs. Sheet, Focus Ring (:focus-visible), Toolbar (Unified Title Bar)

## Accordion (Disclosure)

**Slug:** `/web/accordion`

### API

`<details>`, `<summary>`

### Aliases

disclosure, expandable sections, collapse, expander

### Descripción

Un accordion es una pila vertical de encabezados que muestran u ocultan el contenido asociado. Abrir una sección la expande en el lugar y desplaza las secciones de abajo, con uno o varios paneles abiertos permitidos según el patrón. Los elementos nativos details y summary aportan la semántica básica de disclosure.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Disclosure trigger | `<summary>` |
| Disclosure indicator | `<summary>::marker` |
| Disclosure panel | `<details>` |

### Prompt de implementación

Build an Accordion from \<details\> and \<summary\> elements. Give grouped \<details\> elements the same name when only one section may be open, preserve native keyboard behavior, and animate the revealed panel without adding redundant aria-expanded; use aria-expanded only for a fully custom disclosure primitive.

### Prompt de debug

Debug my accordion (details/summary, Radix Accordion). Rule out: height auto refusing to animate — animate grid-template-rows 0fr to 1fr or use interpolate-size; single vs multiple type letting two panels open when one was intended; the default disclosure marker still rendering next to a custom icon; focus landing inside a closed panel because contents were hidden with opacity instead of display. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<details>` | — |
| HTML | `<summary>` | — |
| HTML | `name` | groups details elements so only one is open |
| Radix | `Accordion` | — |

### Ver también

Tabs (Web), Disclosure Triangle (macOS), Sidebar/Source List (macOS)

## Tabs

**Slug:** `/web/tabs`

### API

`role="tablist"`, `role="tab"`

### Aliases

tabbed interface, tab list, tab bar

### Descripción

Las tabs organizan vistas pares dentro de una región compartida, con exactamente una pestaña y un panel activos a la vez. La etiqueta seleccionada es visualmente persistente, a menudo con un subrayado, y los usuarios de teclado se mueven por la lista de pestañas con las flechas. Se usan para vistas estrechamente relacionadas, no para un flujo secuencial.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Tab list | `role="tablist"` |
| Active-tab indicator | `aria-selected="true"` |
| Tab panel | `role="tabpanel"` |

### Prompt de implementación

Build accessible Tabs with a role="tablist", one role="tab" marked aria-selected="true", and a matching role="tabpanel" connected with aria-controls and aria-labelledby. Keep only the active tab at tabindex="0", move between tabs with Left and Right Arrow, and switch the shared panel without navigating away.

### Prompt de debug

Debug my tabs (role=tablist/tab/tabpanel, roving tabindex). Rule out: every tab in the Tab order instead of one roving tabindex with arrow-key movement; panels missing aria-labelledby back-references; the active indicator not moving on resize because its position was measured once; panel state lost on switch because inactive panels unmount when they should hide. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| ARIA | `role="tablist"` | — |
| ARIA | `role="tab"` | — |
| ARIA | `role="tabpanel"` | — |
| Radix | `Tabs` | — |

### Ver también

Accordion (Disclosure), Toggle Group (Segmented Control), Segmented Control

## Badge

**Slug:** `/web/badge-chip-pill`

### API

`<button>`

### Aliases

token, lozenge, capsule

### Descripción

Un badge es un pequeño contador o marcador de estado adherido a otro objeto. Un chip es un token compacto e interactivo que puede seleccionarse, editarse o eliminarse; un pill describe la forma de cápsula más que un comportamiento estricto. Un tag suele ser metadato de categoría no interactivo, así que el término se elige por su función y no solo por los bordes redondeados.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Badge anchor | `Badge` |
| Badge count | `Badge` |
| Chip remove button | `<button aria-label>` |
| Selected chip state | `aria-pressed` |

### Prompt de implementación

Use a Badge for the compact unread count, a dismissible Chip for the active filter, a fully rounded Pill for short status text, and a Tag for category metadata. Use shadcn/ui Badge for the non-interactive labels and give any icon-only remove button an aria-label.

### Prompt de debug

Debug my badge/chip/pill. Rule out: unbounded counts blowing the layout instead of capping at 99+; the pill wrapping mid-label without white-space nowrap; a chip delete target far smaller than 24px so taps miss; low-contrast fills failing in dark mode because the colors were not themed as a pair. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| shadcn/ui | `Badge` | — |
| HTML | `<button>` | for a removable or selectable chip |
| ARIA | `aria-label` | — |

### Ver también

Dock Badge (macOS), Toggle Group (Segmented Control) (Web), Switch vs. Checkbox vs. Radio (Web)

## Breadcrumbs

**Slug:** `/web/breadcrumbs`

### API

`<nav>`

### Aliases

breadcrumb trail, path navigation, hierarchy trail

### Descripción

Los breadcrumbs muestran la posición de la página actual dentro de una jerarquía y ofrecen enlaces directos a sus ancestros. El último ítem es la ubicación actual y no un enlace, y los separadores son decorativos. Las rutas profundas pueden colapsar los niveles intermedios en una elipsis sin ocultar la raíz ni la página actual.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Breadcrumb separator | `aria-hidden="true"` |
| Current-page crumb | `aria-current="page"` |
| Collapsed ancestors | `BreadcrumbEllipsis` |

### Prompt de implementación

Add breadcrumbs inside a \<nav aria-label="Breadcrumb"\>, linking each ancestor and marking the final item aria-current="page". Collapse low-value middle ancestors into an ellipsis when space is tight while keeping the current page visible.

### Prompt de debug

Debug my breadcrumbs (nav aria-label=breadcrumb, aria-current=page). Rule out: separators typed into the markup so screen readers announce every slash — draw them with CSS pseudo-elements; aria-current missing from the last crumb; long trails needing middle-crumb collapse instead of wrapping to two lines; the current page rendered as a link to itself. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<nav>` | — |
| ARIA | `aria-label="Breadcrumb"` | — |
| ARIA | `aria-current="page"` | — |
| shadcn/ui | `Breadcrumb` | — |

### Ver también

Sidebar (Source List), Tabs, Toolbar (Unified Title Bar), Site Header vs. Navigation Bar

## Sticky vs. Fixed Positioning

**Slug:** `/web/sticky-fixed`

### API

`position: sticky`, `position: fixed`

### Aliases

sticky header, fixed header, pinned element

### Descripción

Un elemento sticky participa en el layout normal hasta que el scroll alcanza su inset, y entonces queda fijado dentro de su área de scroll contenedora. Un elemento fixed se saca del flujo normal y se ancla al viewport o a un bloque contenedor transformado desde el inicio. Sticky suele ser lo adecuado para encabezados de tablas y secciones; fixed es típico para controles persistentes del viewport.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Sticky threshold | `top` |
| Sticky scroll container | `position: sticky` |

### Prompt de implementación

Use position: sticky with top: 0 for the section header so it scrolls normally until it reaches the top of its nearest scrolling container, then remains there. Reserve position: fixed for UI that must stay anchored to the viewport independently of every scroll container.

### Prompt de debug

Debug my sticky/fixed positioning. Rule out: sticky doing nothing because an ancestor has overflow hidden/auto/scroll — that is the classic; sticky missing a top/bottom offset so it never engages; fixed behaving like absolute inside a transformed/filtered ancestor; the content jumping when an element switches to fixed because no placeholder reserves its height. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `position: sticky` | — |
| CSS | `position: fixed` | — |
| CSS | `top` | — |

### Ver también

Toolbar (Unified Title Bar), Sidebar (Source List), Popover vs. Dropdown Menu vs. Tooltip, Site Header vs. Navigation Bar, Parallax Scrolling

## Focus Ring (:focus-visible)

**Slug:** `/web/focus-ring-web`

### API

`:focus-visible`, `:focus`

### Aliases

focus indicator, keyboard focus outline, focus halo

### Descripción

Un focus ring identifica el elemento que recibirá la próxima acción de teclado. La pseudo-clase :focus coincide con cualquier elemento con foco, mientras que :focus-visible deja que el navegador muestre el indicador fuerte cuando la modalidad de entrada o el control lo requieren, sobre todo en la navegación con teclado. Nunca hay que quitar el outline por defecto sin proveer un reemplazo igual de visible.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Focus outline | `outline` |
| Outline offset | `outline-offset` |

### Prompt de implementación

Style the keyboard focus ring with :focus-visible instead of suppressing the browser outline globally. Make it high contrast and clearly offset from the control; use :focus only for state that must apply regardless of whether focus came from keyboard or pointer.

### Prompt de debug

Debug my focus ring (outline, :focus-visible). Rule out: a global outline:none killing keyboard navigation everywhere; :focus styling mouse clicks when :focus-visible was intended; the ring clipped by an overflow-hidden ancestor — use outline-offset or box-shadow inside; a box-shadow ring invisible against a same-color background; programmatic .focus() not showing a ring without focus-visible options. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| CSS | `:focus-visible` | — |
| CSS | `:focus` | — |
| HTML | `tabindex` | — |

### Ver también

Form Field (Web), Focus Ring (macOS), Command Palette (Web), Switch vs. Checkbox vs. Radio (Web), Toggle Group/Segmented Control (Web)

## Empty State

**Slug:** `/web/empty-state`

### API

`<section>`

### Aliases

blank state, zero state, first-use state, no-results state

### Descripción

Un empty state reemplaza una vista de contenido cuando no hay ítems para mostrar, ya sea en el primer uso, después de filtrar o después de eliminar todo. Explica la situación sin culpar al usuario y ofrece la acción siguiente más útil. Es un estado de producto diseñado, no mero espacio en blanco ni un mensaje de error.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| State illustration | `aria-hidden="true"` |
| Recovery action | `<button>` |

### Prompt de implementación

Create an empty state as a labelled \<section\> with a simple icon, a one-line explanation of why the view is empty, and one primary action that resolves it. For a dynamically produced no-results state, announce the message with role="status" without moving focus.

### Prompt de debug

Debug my empty state. Rule out: the empty state flashing before data arrives because loading and truly-empty are one boolean; errors rendering the empty state instead of an error state; the call-to-action unreachable by keyboard; layout jumping when real content replaces it because heights were never reserved.

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<section>` | — |
| ARIA | `aria-labelledby` | — |
| ARIA | `role="status"` | for a dynamically produced no-results message |

### Ver también

Skeleton vs. Spinner, Toast (Snackbar), Command Palette

## Hover Card

**Slug:** `/web/hover-card`

### API

`HoverCard`, `:hover`

### Aliases

hover preview, profile preview, preview card

### Descripción

Un hover card es una vista previa rica asociada a una persona, lugar u objeto enlazado. Revela más información que un tooltip y puede incluir metadatos pasivos o unas pocas acciones, dejando la página subyacente usable. Sus delays de apertura y cierre deben permitir que el puntero pase del trigger a la tarjeta sin parpadeo.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Preview trigger | `HoverCardTrigger` |
| Preview content | `HoverCardContent` |

### Prompt de implementación

Add a hover card using Radix HoverCard to preview the linked profile with an avatar and summary. Reveal it from both hover and keyboard focus after a short delay, keep it open while the pointer crosses into the card, and reverse the opacity and transform transitions smoothly on exit.

### Prompt de debug

Debug my hover card (Radix HoverCard, mouseenter/mouseleave). Rule out: the card closing while the pointer travels from trigger to card — you need a hover-intent delay or safe-polygon; touch devices never opening it because there is no hover — provide a tap/focus path; open/close delays tuned so short it flickers on skim; the card trapped under another stacking context.

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| Radix | `HoverCard` | — |
| CSS | `:hover` | — |
| HTML | `popover` | — |
| CSS | `:focus-visible` | — |

### Ver también

Popover vs. Dropdown Menu vs. Tooltip, Combobox (Autocomplete / Typeahead), Focus Ring (:focus-visible), Popover (macOS)

## Switch, Checkbox, Radio

**Slug:** `/web/switch-checkbox-radio`

### API

`<input type="checkbox" role="switch">`, `<input type="checkbox">`, `<input type="radio">`

### Aliases

toggle switch, check box, radio button, option button

### Descripción

Un switch controla una configuración binaria y comunica que el cambio surte efecto de inmediato, como activar las notificaciones. Un checkbox representa un valor de formulario independiente y puede esperar a Guardar o Enviar; pueden seleccionarse varios a la vez. Los radio buttons forman un grupo con nombre en el que elegir una opción des-selecciona las demás.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Switch thumb | `role="switch"` |
| Switch track | `role="switch"` |
| Checkbox checkmark | `<input type="checkbox">` |
| Radio selection dot | `<input type="radio">` |

### Prompt de implementación

Use an \<input type="checkbox" role="switch"\> for the binary on/off setting, a native \<input type="checkbox"\> for each independent checked choice, and same-name \<input type="radio"\> controls when exactly one option is allowed. Give every control a visible clickable label and expose its checked state through the native control.

### Prompt de debug

Debug my switch/checkbox/radio. Rule out: the control flipping visually while state stays stale — controlled input without onChange; label clicks not toggling because for/id association is missing; radios not behaving as a group because their name attributes differ; the indeterminate checkbox state gone — it is settable only from JS, not markup. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| HTML | `<input type="checkbox" role="switch">` | — |
| HTML | `<input type="checkbox">` | — |
| HTML | `<input type="radio">` | — |
| shadcn/ui | `Switch` | — |
| shadcn/ui | `Checkbox` | — |

### Ver también

Toggle Group (Segmented Control), Badge vs. Chip vs. Pill vs. Tag, Focus Ring (:focus-visible), Segmented Control

## Toggle Group (Segmented Control)

**Slug:** `/web/toggle-group`

### API

`ToggleGroup`, `role="radiogroup"`

### Aliases

segmented control, button group, view switcher, segmented button

### Descripción

Un toggle group es una fila compacta de botones relacionados que se comportan como un único control de selección. En su forma de selección única suele llamarse segmented control y funciona bien para cambiar una vista o un modo de inmediato. A diferencia de las tabs, cambia una configuración o presentación en lugar de rotular paneles de contenido separados.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Selected toggle | `aria-checked` |
| Segment divider | `ToggleGroup` |

### Prompt de implementación

Build a persistent single-select Toggle Group using Radix ToggleGroup. Present the connected buttons as one segmented control, expose the group as role="radiogroup" with role="radio" items and aria-checked state, and support arrow-key movement between segments.

### Prompt de debug

Debug my toggle group (aria-pressed, Radix ToggleGroup). Rule out: single vs multiple semantics mixed up — one behaves like radios, the other like checkboxes; the pressed state invisible because only color changes and not enough of it; deselecting the last item leaving nothing active when one must always stay on; arrow keys dead because roving focus is unimplemented. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| Radix | `ToggleGroup` | — |
| ARIA | `role="radiogroup"` | — |
| ARIA | `role="radio"` | — |
| ARIA | `aria-checked` | — |
| shadcn/ui | `ToggleGroup` | — |

### Ver también

Tabs, Switch vs. Checkbox vs. Radio, Segmented Control (macOS), Badge vs. Chip vs. Pill vs. Tag

## Toast (Snackbar)

**Slug:** `/web/toast`

### API

`role="status"`, `Toaster`

### Aliases

snackbar, status toast, in-app notification

### Descripción

Un toast es un mensaje de estado compacto y no modal que aparece en una esquina de la pantalla tras una acción y se descarta automáticamente. Confirma resultados transitorios como guardar o copiar sin interrumpir el flujo de trabajo. A diferencia de un banner de notificación, no ocupa un lugar persistente en el layout de la página ni exige confirmación.

### Anatomía

| Parte | Símbolo |
| :---- | :---- |
| Toast viewport | `Toaster` |
| Status message | `role="status"` |
| Toast action | `ToastAction` |

### Prompt de implementación

Show a Toast (Snackbar) through a role="status" live region after the action succeeds. Place it in a consistent corner without blocking the page, auto-dismiss only nonessential messages after a short delay, and pause that timer while the toast is hovered or contains keyboard focus.

### Prompt de debug

Debug my toast (aria-live region, sonner). Rule out: no aria-live region so screen readers never announce it; the auto-dismiss timer not pausing on hover/focus; stacked toasts overlapping instead of shifting; the exit animation racing the removal so it snaps; toasts rendering under modals because of z-index order. The symptom:

### In code

| Librería | Identificador | Nota |
| :---- | :---- | :---- |
| ARIA | `role="status"` | — |
| shadcn/ui | `Toaster` | — |
| Sonner | `toast()` | — |
| ARIA | `aria-live="polite"` | announces non-urgent updates |

### Ver también

Scrim (Backdrop / Overlay), Empty State, Popover vs. Dropdown Menu vs. Tooltip

## Confusiones frecuentes

Pares que la gente confunde, según [https://namethatui.com/vs](https://namethatui.com/vs) (cada uno tiene página propia en `/vs/<slug>`):

| Comparación | Clave para distinguir | Slug |
| :---- | :---- | :---- |
| Popover vs. Tooltip | El tooltip aparece on hover, solo lleva un texto corto y desaparece al salir el puntero | `/vs/popover-vs-tooltip` |
| Modal vs. Popover | El modal toma control: se centra, oscurece la página con un scrim y bloquea todo | `/vs/modal-vs-popover` |
| Dropdown vs. Select vs. Combobox | El dropdown menu ejecuta acciones (Rename, Delete…) — nunca guarda un valor elegido | `/vs/dropdown-vs-select-vs-combobox` |
| Tabs vs. Segmented Control | Las tabs navegan: cada tab es dueña de su panel y cambiar intercambia toda la región de contenido | `/vs/tabs-vs-segmented-control` |
| Accordion vs. Tabs | Las tabs van en una fila horizontal y muestran exactamente un panel a la vez | `/vs/accordion-vs-tabs` |
| Toast vs. Alert | El toast entra deslizándose, confirma algo que ya pasó ("Saved") y se va solo | `/vs/toast-vs-alert` |
| Tooltip vs. Hover Card | El tooltip es una sola línea de texto plano que nombra lo que está bajo el puntero | `/vs/tooltip-vs-hover-card` |
| Context Menu vs. Dropdown | El context menu se abre EN EL PUNTERO con click derecho sobre el objeto mismo | `/vs/context-menu-vs-dropdown` |
| Carousel vs. Marquee | El carousel es paginado y manejado por el usuario: flechas, swipe y los puntitos | `/vs/carousel-vs-marquee` |
| Lightbox vs. Modal | El lightbox ES un modal, especializado en media | `/vs/lightbox-vs-modal` |
| Masonry vs. Bento Grid | Masonry empaqueta cards de altura DESCONOCIDA en columnas, tipo Pinterest | `/vs/masonry-vs-bento-grid` |
| Sidebar vs. Drawer | El sidebar es mobiliario: una columna de navegación persistente que comparte el layout | `/vs/sidebar-vs-drawer` |
| Hamburger vs. Kebab | Tres LÍNEAS horizontales es el hamburger: abre la navegación principal del sitio | `/vs/hamburger-vs-kebab` |
| Easing vs. Spring | El easing dobla el tiempo: la animación corre una duración fija sobre una curva de velocidad | `/vs/easing-vs-spring` |
| Stepper vs. Slider | El stepper lo ajusta en pasos chicos y precisos — click arriba, click abajo | `/vs/stepper-vs-slider` |
| Sheet vs. Alert (macOS) | El sheet sale de la title bar de UNA ventana y bloquea solo esa ventana | `/vs/sheet-vs-alert` |
| Empty State vs. Skeleton | El skeleton significa que el contenido VIENE en camino — formas grises pulsantes sostienen el layout | `/vs/empty-state-vs-skeleton` |
| Toolbar vs. Menu Bar (macOS) | La menu bar es la única franja en el tope de la PANTALLA | `/vs/toolbar-vs-menu-bar` |

