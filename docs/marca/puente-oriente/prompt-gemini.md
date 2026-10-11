# Prompts para Gemini

El master del logo son los SVG de esta guía. Gemini genera imágenes rasterizadas: sirve para explorar variantes y para mockups, pero cualquier logo que salga de ahí hay que redibujarlo o vectorizarlo antes de usarlo. Los prompts van en inglés porque los modelos de imagen responden con más precisión.

## 1. Isotipo (exploración de variantes)

```text
Flat vector logo icon for an import company called "Puente Oriente" (Spanish for "Eastern Bridge").

Shape: a perfect circle designed like an ancient Chinese cash coin (a round coin with a square hole in the center).

Colors: only two flat colors. Solid bright orange #FF6A1A for the coin disc, pure white #FFFFFF for every line and shape inside it.

Composition, all in white on the orange disc:
- A thin white ring just inside the edge of the disc, like the raised rim of a coin.
- In the exact center, the coin's square hole drawn as a thick white square frame.
- That square also works as the small pavilion standing on top of a traditional Chinese arched bridge.
- The bridge is a thick white curved deck spanning the lower half of the coin from rim to rim, peaking right under the square.
- A simple railing on the bridge: one thin rail and four short posts topped with small round ball finials, two posts on each side of the square.
- Two short horizontal white lines under the bridge suggesting water.

Style: geometric, perfectly symmetrical, bold simple shapes, clean edges, minimalist corporate icon in the style of B2B e-commerce marketplace app icons. Must stay readable at 32 px.

Avoid: gradients, shadows, 3D, bevels, texture, glow, outlines around the circle, any text, letters or Chinese characters, extra decorations, dragons, lanterns.

Output: the icon centered on a plain white background, square 1:1 format, high resolution.
```

## 2. Variante más minimalista (para favicon o sello)

```text
Ultra-minimal flat icon: an orange (#FF6A1A) circle shaped like a Chinese cash coin, with a white rim ring, a white square frame in the center, and a single thick white arch (a bridge) under the square spanning the lower half of the circle. Two colors only, no text, no gradients, no shadows, perfectly symmetrical, bold shapes readable at 16 px, centered on a white background, 1:1.
```

## 3. Mockups con el logo real

Adjuntá `isotipo-naranja.png` o `logo-horizontal.png` (exportados de los SVG) y usá:

```text
Use the attached logo exactly as it is, without redrawing or changing it. Create a realistic photo mockup of [a business card on a dark stone desk / a cardboard shipping box with the logo stenciled in one color / a shipping container door with the logo painted on it / a storefront sign]. Brand colors: orange #FF6A1A, dark navy ink #1E2230, white. Soft natural light, shallow depth of field, professional product photography, no extra text.
```

## Consejos

- Pedí 4 variantes por vez y quedate con ideas, no con archivos: la geometría final se ajusta en vector.
- Los modelos de imagen deforman las letras: no les pidas el logotipo con texto. El wordmark ya está armado en Poppins Bold en los SVG.
- Para pasar un resultado de Gemini a vector: Illustrator (Calco de imagen, modo 2 colores) o Inkscape (Trazar mapa de bits), y después limpiar nodos y simetría a mano.
