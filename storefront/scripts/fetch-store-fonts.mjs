// Baja de Google Fonts las fuentes que el editor de diseño deja elegir
// (subconjunto latin, woff2) a src/app/fonts/ y regenera src/app/store-fonts.ts.
//
// Se corre a mano, solo cuando cambia el catálogo de fuentes:
//   node storefront/scripts/fetch-store-fonts.mjs && pnpm --filter tiendafy-storefront exec prettier --write src/app/store-fonts.ts
//
// Por qué no next/font/google: baja las fuentes en cada build y depende de lo que
// Google responda en ese momento; desde los runners de CI devolvió URLs que
// Turbopack no sabe resolver y rompió la imagen. Con los archivos en el repo el
// build no sale a la red y siempre da lo mismo.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(root, 'src/app/fonts');
// El mismo navegador que usa next/font: con este Google sirve woff2.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';

// const, familia en Google, ejes pedidos, variable CSS, fallback métrico.
const FONTS = [
  ['fraunces', 'Fraunces', 'ital,wght@0,100..900;1,100..900', '--font-fraunces', 'Times New Roman'],
  ['poppins', 'Poppins', 'wght@400;500;600;700', '--font-poppins', 'Arial'],
  ['inter', 'Inter', 'wght@400;500;600;700', '--font-inter', 'Arial'],
  ['montserrat', 'Montserrat', 'wght@400;500;600;700;800;900', '--font-montserrat', 'Arial'],
  ['barlow', 'Barlow', 'wght@400;500;600;700', '--font-barlow', 'Arial'],
  ['barlowCondensed', 'Barlow Condensed', 'wght@400;600;700', '--font-barlow-condensed', 'Arial'],
  ['dmSans', 'DM Sans', 'wght@400;500;700', '--font-dm-sans', 'Arial'],
  ['manrope', 'Manrope', 'wght@400;600;700', '--font-manrope', 'Arial'],
  ['workSans', 'Work Sans', 'wght@400;600;700', '--font-work-sans', 'Arial'],
  ['spaceGrotesk', 'Space Grotesk', 'wght@400;500;700', '--font-space-grotesk', 'Arial'],
  ['playfair', 'Playfair Display', 'wght@400;600;700;800', '--font-playfair', 'Times New Roman'],
  ['lora', 'Lora', 'wght@400;500;600;700', '--font-lora', 'Times New Roman'],
  ['cormorant', 'Cormorant Garamond', 'wght@400;500;600;700', '--font-cormorant', 'Times New Roman'],
  ['dmSerif', 'DM Serif Display', 'wght@400', '--font-dm-serif', 'Times New Roman'],
  ['bebas', 'Bebas Neue', 'wght@400', '--font-bebas', 'Arial'],
  ['archivoBlack', 'Archivo Black', 'wght@400', '--font-archivo-black', 'Arial'],
];

const slug = (family) => family.toLowerCase().replace(/\s+/g, '-');

/** Los @font-face del subconjunto latin: archivo → estilo y pesos que cubre. */
async function latinFaces(family, axes) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axes}&display=swap`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${family}: Google respondió ${res.status}`);
  const css = await res.text();
  const files = new Map();
  for (const [, block] of css.matchAll(/\/\* latin \*\/\s*@font-face\s*{([^}]+)}/g)) {
    const src = block.match(/src:\s*url\(([^)]+)\)/)[1];
    // A veces Google sirve /s/<familia>/…woff2 y a veces /l/font?kit=…&skey=…
    // (esta forma es la que Turbopack no resuelve); las dos son woff2.
    if (!src.startsWith('https://fonts.gstatic.com/')) throw new Error(`${family}: URL inesperada ${src}`);
    const style = block.match(/font-style:\s*(\w+)/)[1];
    const weights = block
      .match(/font-weight:\s*([\d ]+);/)[1]
      .trim()
      .split(/\s+/)
      .map(Number);
    const face = files.get(src) ?? { style, weights: [] };
    face.weights.push(...weights);
    files.set(src, face);
  }
  if (files.size === 0) throw new Error(`${family}: sin @font-face latin`);
  return files;
}

await rm(fontsDir, { recursive: true, force: true });
await mkdir(fontsDir, { recursive: true });

const calls = [];
for (const [name, family, axes, variable, fallback] of FONTS) {
  const faces = await latinFaces(family, axes);
  const src = [];
  for (const [url, { style, weights }] of faces) {
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const weight = min === max ? String(min) : `${min} ${max}`;
    const file = `${slug(family)}-${style === 'italic' ? 'italic-' : ''}${weight.replace(' ', '-')}.woff2`;
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`${file}: no es woff2`);
    await writeFile(join(fontsDir, file), bytes);
    src.push({ path: `./fonts/${file}`, weight, style });
    console.log(`${file}  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  const srcCode = src
    .map((s) => `{ path: '${s.path}', weight: '${s.weight}', style: '${s.style}' }`)
    .join(', ');
  calls.push(
    `const ${name} = localFont({ src: [${srcCode}], display: 'swap', preload: false, variable: '${variable}', adjustFontFallback: '${fallback}' });`,
  );
}

const ts = `import localFont from 'next/font/local';

/*
 * Las fuentes que el editor de diseño deja elegir, servidas por la propia
 * tienda. Los archivos están en ./fonts (subconjunto latin de Google Fonts,
 * licencia SIL OFL 1.1) y este archivo lo genera scripts/fetch-store-fonts.mjs:
 * no editarlo a mano.
 *
 * Antes venían de una hoja de estilos de Google con las quince familias: un
 * pedido a otro dominio que frenaba el primer pintado de cada página, y además
 * Fraunces se precargaba siempre (81 KB) aunque la tienda no la usara. Ahora
 * ninguna se precarga: el navegador baja solo la que el tema aplica, cuando la
 * aplica, desde el mismo dominio.
 *
 * Cada una queda en una variable CSS (--font-<nombre>) que lib/theme usa al
 * armar --font-heading y --font-body.
 */
// next/font exige una const por fuente, con las opciones escritas literal.
${calls.join('\n')}

const fonts = [${FONTS.map(([name]) => name).join(', ')}];

/** Las clases que declaran las variables de todas las fuentes (van en <body>). */
export const storeFontVariables = fonts.map((f) => f.variable).join(' ');
`;
await writeFile(join(root, 'src/app/store-fonts.ts'), ts);
await writeFile(
  join(fontsDir, 'README.md'),
  `# Fuentes de la tienda

Subconjunto latin de Google Fonts (https://fonts.google.com), en woff2. Todas
las familias se distribuyen bajo la SIL Open Font License 1.1
(https://openfontlicense.org), que permite incluirlas y servirlas con la app.

No se editan a mano: \`node storefront/scripts/fetch-store-fonts.mjs\` las baja
de nuevo y regenera \`src/app/store-fonts.ts\`.
`,
);
console.log('listo');
