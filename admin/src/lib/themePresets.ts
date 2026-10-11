/**
 * Diseños listos para usar (DSL compacto de la galería). Aplicar = PUT del
 * borrador con presetToConfig(preset) (ThemeGallery); el merchant los ajusta
 * después en el editor. Tokens en RGB crudo (formato de tokens.css).
 *
 * Orden de la galería: paletas claras primero, oscuras después; las
 * verticales (gimnasio/motos/autos) quedan agrupadas.
 */

import type {
  BorderRadiusStyle,
  ComingSoonConfig,
  DensityStyle,
  FontOptionValue,
  IconKit,
  MotionStyle,
  SectionType,
  ThemeHeader,
} from '@tiendafy/types';

interface ThemeSectionPreset {
  /** Los cuatro de siempre, o cualquier `SectionType` real del tema. */
  type: 'hero' | 'featured-products' | 'info-bar' | 'newsletter' | SectionType;
  visible: boolean;
  title?: string;
  variant?: 'centered' | 'banner' | 'minimal';
  /**
   * Contenido de la sección (el `data` del tema: items de la barra, preguntas
   * del FAQ, texto del bloque con imagen…). Un preset de marca sin texto deja
   * una home con títulos vacíos, que es peor que no tener la sección: lo que
   * se escribe acá ya está en la voz de esa marca y el comercio lo edita.
   */
  data?: Record<string, unknown>;
}

export interface ThemePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  tokens: {
    colorPrimary: string;
    colorPrimaryHover: string;
    colorBg: string;
    colorBgSubtle: string;
    colorFg: string;
    /** Acento propio (precios, destacados). Sin esto se usa el primario. */
    colorAccent?: string;
  };
  announcement: string;
  sections: ThemeSectionPreset[];

  /*
   * De acá para abajo, todo opcional: los presets genéricos no lo traen y
   * siguen comportándose igual. Lo usan los presets de MARCA, que tienen que
   * respetar una guía — tipografías, forma de los bordes, kit de íconos— y no
   * solo una paleta. Una identidad de bloques rectos con botones redondeados
   * no es esa identidad.
   */
  fonts?: { heading: FontOptionValue; body: FontOptionValue };
  borderRadius?: BorderRadiusStyle;
  density?: DensityStyle;
  motion?: MotionStyle;
  iconKit?: IconKit;
  header?: {
    layout?: ThemeHeader['layout'];
    border?: ThemeHeader['border'];
    showSearch?: boolean;
    /** Barra propia. Sin esto se calcula una con contraste garantizado. */
    bg?: string;
    textColor?: string;
  };
  /**
   * Logo y favicon servidos por la propia vitrina (storefront/public/marca/…).
   * Son marcas de esta instalación, fijas y conocidas: así la tienda queda
   * vestida al aplicar el diseño, sin depender de que alguien suba el archivo
   * ni de que el storage esté sembrado. El comercio puede reemplazarlos desde
   * el editor cuando quiera.
   */
  logo?: string;
  favicon?: string;
  seo?: { title: string; description: string };
  /** Para marcas que todavía no abren: la página de espera ya vestida. */
  comingSoon?: Partial<ComingSoonConfig>;
}

const baseSections = (
  heroVariant: ThemeSectionPreset['variant'],
  catalogTitle: string,
  withNewsletter: boolean,
): ThemeSectionPreset[] => [
  { type: 'hero', visible: true, variant: heroVariant },
  { type: 'featured-products', visible: true, title: catalogTitle },
  { type: 'info-bar', visible: true },
  { type: 'newsletter', visible: withNewsletter, title: 'Recibí novedades' },
];

export const themePresets: ThemePreset[] = [
  {
    id: 'galeria',
    name: 'Galería',
    category: 'Minimal',
    description: 'Blanco y negro puro. El producto es el protagonista.',
    tokens: {
      colorPrimary: '17 17 17',
      colorPrimaryHover: '60 60 60',
      colorBg: '255 255 255',
      colorBgSubtle: '247 247 247',
      colorFg: '17 17 17',
    },
    announcement: '',
    sections: baseSections('minimal', 'Catálogo', false),
  },
  {
    id: 'terracota',
    name: 'Terracota',
    category: 'Deco y hogar',
    description: 'Cálido y artesanal, para piezas hechas a mano.',
    tokens: {
      // Un punto más oscuro que el original (193 88 55): así el texto encima
      // llega a 4.5:1. Con el valor anterior no llegaba ni con blanco ni con
      // oscuro — el botón de comprar quedaba por debajo del mínimo de WCAG AA.
      colorPrimary: '192 87 54',
      colorPrimaryHover: '160 70 42',
      colorBg: '252 249 244',
      colorBgSubtle: '246 238 227',
      colorFg: '43 32 26',
    },
    announcement: 'Envíos gratis desde $80.000',
    sections: baseSections('centered', 'Hecho a mano', true),
  },
  {
    id: 'ladrillo',
    name: 'Ladrillo',
    category: 'Vintage',
    description: 'Rojo ladrillo y papel viejo, espíritu de feria.',
    tokens: {
      colorPrimary: '170 60 38',
      colorPrimaryHover: '140 48 30',
      colorBg: '249 245 237',
      colorBgSubtle: '241 233 219',
      colorFg: '41 32 26',
    },
    announcement: 'Piezas únicas, stock limitado',
    sections: baseSections('banner', 'Recién llegado', true),
  },
  {
    id: 'cafeto',
    name: 'Cafeto',
    category: 'Alimentos',
    description: 'Marrones tostados para café y gourmet.',
    tokens: {
      colorPrimary: '111 74 47',
      colorPrimaryHover: '88 58 36',
      colorBg: '251 247 241',
      colorBgSubtle: '243 234 222',
      colorFg: '46 33 23',
    },
    announcement: 'Tostado de la semana: Yirgacheffe',
    sections: baseSections('minimal', 'Tostado fresco', true),
  },
  {
    id: 'algodon',
    name: 'Algodón',
    category: 'Moda',
    description: 'Rosa empolvado, suave y femenino.',
    tokens: {
      colorPrimary: '214 109 132',
      colorPrimaryHover: '186 86 110',
      colorBg: '255 251 252',
      colorBgSubtle: '250 240 243',
      colorFg: '52 36 41',
    },
    announcement: '3 cuotas sin interés',
    sections: baseSections('centered', 'Nuevos ingresos', true),
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    category: 'Belleza',
    description: 'Violetas suaves para cosmética y bienestar.',
    tokens: {
      colorPrimary: '124 92 191',
      colorPrimaryHover: '101 72 160',
      colorBg: '252 251 254',
      colorBgSubtle: '244 241 250',
      colorFg: '40 34 52',
    },
    announcement: 'Cruelty free · Ingredientes naturales',
    sections: baseSections('centered', 'Cuidate', true),
  },
  {
    id: 'joya',
    name: 'Joya',
    category: 'Accesorios',
    description: 'Crema y borgoña, vitrina de boutique.',
    tokens: {
      colorPrimary: '128 44 60',
      colorPrimaryHover: '100 33 46',
      colorBg: '253 251 248',
      colorBgSubtle: '246 241 234',
      colorFg: '40 30 32',
    },
    announcement: 'Plata 925 con garantía',
    sections: baseSections('minimal', 'Piezas únicas', true),
  },
  {
    id: 'vivero',
    name: 'Vivero',
    category: 'Plantas y jardín',
    description: 'Verdes naturales, aire fresco.',
    tokens: {
      colorPrimary: '30 91 63',
      colorPrimaryHover: '22 70 48',
      colorBg: '250 252 248',
      colorBgSubtle: '238 245 235',
      colorFg: '26 36 30',
    },
    announcement: 'Retiro gratis por el vivero',
    sections: baseSections('centered', 'Verde para tu casa', true),
  },
  {
    id: 'huella',
    name: 'Huella',
    category: 'Mascotas',
    description: 'Verde agua amable y limpio, para pet shops.',
    tokens: {
      colorPrimary: '13 148 136',
      colorPrimaryHover: '15 118 110',
      colorBg: '250 252 251',
      colorBgSubtle: '236 247 244',
      colorFg: '28 40 38',
    },
    announcement: 'Envío gratis en alimentos +$60.000',
    sections: baseSections('centered', 'Para tu compañero', true),
  },
  {
    id: 'oceano',
    name: 'Océano',
    category: 'Deporte',
    description: 'Azul profundo con frescura costera.',
    tokens: {
      colorPrimary: '12 74 110',
      colorPrimaryHover: '8 51 78',
      colorBg: '248 251 253',
      colorBgSubtle: '235 243 248',
      colorFg: '23 37 47',
    },
    announcement: 'Envíos a todo el país en 48hs',
    sections: baseSections('banner', 'Equipate', false),
  },
  {
    id: 'hierro',
    name: 'Hierro',
    category: 'Gimnasio',
    description: 'Negro y naranja energía, para deportes y fitness.',
    tokens: {
      colorPrimary: '249 115 22',
      colorPrimaryHover: '217 95 12',
      colorBg: '18 19 22',
      colorBgSubtle: '28 30 34',
      colorFg: '240 240 242',
    },
    announcement: 'Envío gratis en suplementos +$60.000',
    sections: baseSections('banner', 'Entrená duro', false),
  },
  {
    id: 'piston',
    name: 'Pistón',
    category: 'Motos',
    description: 'Rojo carrera sobre negro, para motos y repuestos.',
    tokens: {
      colorPrimary: '220 38 38',
      colorPrimaryHover: '185 28 28',
      colorBg: '16 16 18',
      colorBgSubtle: '26 26 30',
      colorFg: '240 238 238',
    },
    announcement: 'Repuestos con garantía · Envío en 48hs',
    sections: baseSections('banner', 'Para tu moto', false),
  },
  {
    id: 'garaje',
    name: 'Garaje',
    category: 'Autos',
    description: 'Grafito y azul eléctrico, para autos y repuestos.',
    tokens: {
      colorPrimary: '37 99 235',
      colorPrimaryHover: '29 78 216',
      colorBg: '20 23 28',
      colorBgSubtle: '30 34 41',
      colorFg: '233 237 243',
    },
    announcement: 'Repuestos originales y alternativos',
    sections: baseSections('minimal', 'Para tu auto', false),
  },
  {
    id: 'tinta',
    name: 'Tinta',
    category: 'Moda',
    description: 'Negro elegante con acento dorado. Para marcas con presencia.',
    tokens: {
      colorPrimary: '191 155 88',
      colorPrimaryHover: '160 128 68',
      colorBg: '21 21 23',
      colorBgSubtle: '32 32 36',
      colorFg: '240 238 234',
    },
    announcement: 'Nueva colección disponible',
    sections: baseSections('minimal', 'La colección', true),
  },
  {
    id: 'electrico',
    name: 'Eléctrico',
    category: 'Urbano',
    description: 'Lima sobre negro, energía de streetwear.',
    tokens: {
      colorPrimary: '163 230 53',
      colorPrimaryHover: '132 204 22',
      colorBg: '14 14 14',
      colorBgSubtle: '24 24 24',
      colorFg: '245 245 245',
    },
    announcement: '10% OFF EN TU PRIMERA COMPRA',
    sections: baseSections('banner', 'Drops', false),
  },
  {
    id: 'medianoche',
    name: 'Medianoche',
    category: 'Tecnología',
    description: 'Azul noche con cian eléctrico, para gadgets.',
    tokens: {
      colorPrimary: '34 211 238',
      colorPrimaryHover: '20 180 205',
      colorBg: '15 20 30',
      colorBgSubtle: '23 30 44',
      colorFg: '230 237 243',
    },
    announcement: 'Garantía oficial · Cuotas sin interés',
    sections: baseSections('minimal', 'Lo último', false),
  },

  /* ------------------------------------------------------------------
     Marcas del grupo. No son paletas sueltas: salen de guías de marca
     escritas, con sus tipografías, su forma y sus reglas de contraste.
     Aplicar uno deja la tienda vestida; después se ajusta en el editor.
     ------------------------------------------------------------------ */
  {
    id: 'puente-oriente',
    name: 'Puente Oriente',
    category: 'Marcas del grupo',
    description: 'Naranja de marca sobre mucho blanco, forma redonda y grilla densa de catálogo B2B.',
    tokens: {
      // Naranja Puente #FF6A1A. NUNCA como color de texto sobre blanco: ahí la
      // guía pide #C2410C, que es el hover y el que usa el editor para links.
      colorPrimary: '255 106 26',
      colorPrimaryHover: '194 65 12',
      colorBg: '255 255 255',
      // Niebla #F4F5F7: secciones alternas y cards de producto.
      colorBgSubtle: '244 245 247',
      // Tinta #1E2230.
      colorFg: '30 34 48',
    },
    // El círculo es el recurso de la marca: píldoras y avatares redondos.
    borderRadius: 'rounded',
    density: 'cozy',
    motion: 'subtle',
    iconKit: 'lucide',
    fonts: { heading: 'poppins', body: 'inter' },
    // "Header blanco con el logo horizontal" + buscador tipo marketplace B2B:
    // las dos cosas son identidad, no preferencias.
    header: {
      layout: 'classic',
      border: 'line',
      showSearch: true,
      bg: '255 255 255',
      textColor: '30 34 48',
    },
    logo: '/marca/puente-oriente/logo-horizontal.svg',
    favicon: '/marca/puente-oriente/favicon.ico',
    seo: {
      title: 'Puente Oriente — Importación directa de China',
      description:
        'Buscamos el proveedor, negociamos en origen y te entregamos la mercadería nacionalizada en tu depósito.',
    },
    announcement: 'Importamos de China: desde una caja hasta un contenedor.',
    // Voz de la guía: números antes que adjetivos, y la jerga explicada la
    // primera vez que aparece. Nada de "envíos rapidísimos".
    sections: [
      { type: 'carousel', visible: true },
      { type: 'category-banners', visible: true, title: 'Qué traemos' },
      { type: 'featured', visible: true, title: 'Destacados' },
      {
        type: 'image-text',
        visible: true,
        title: 'Cómo trabajamos',
        data: {
          title: 'Cómo trabajamos',
          description:
            'Buscamos el proveedor, negociamos el precio en origen y te entregamos la mercadería nacionalizada en tu depósito. Estamos en China: vemos la fábrica, revisamos la muestra y seguimos el contenedor hasta que llega.',
          buttonText: 'Pedí tu cotización',
        },
      },
      { type: 'brands', visible: true, title: 'Marcas que importamos' },
      {
        type: 'info-bar',
        visible: true,
        data: {
          items: [
            {
              icon: 'shipping',
              title: 'Presencia en origen',
              description: 'Negociamos y revisamos en China',
            },
            { icon: 'security', title: 'Nacionalizado', description: 'Despacho de aduana incluido' },
            {
              icon: 'support',
              title: 'Te acompañamos',
              description: 'Hasta que la mercadería está en tu depósito',
            },
          ],
        },
      },
      {
        type: 'faq',
        visible: true,
        title: 'Preguntas sobre importar',
        data: {
          title: 'Preguntas sobre importar',
          items: [
            {
              question: '¿Cuál es el pedido mínimo?',
              answer:
                'Depende de la fábrica. El MOQ (pedido mínimo, la cantidad más chica que acepta producir un proveedor) suele arrancar en 500 unidades por modelo, pero hay productos que salen desde mucho menos. Te lo decimos antes de que pongas un peso.',
            },
            {
              question: '¿Cuánto tarda en llegar?',
              answer:
                'Un contenedor de Shenzhen a Buenos Aires son unos 35 días de tránsito marítimo, más la producción y el despacho. Si se demora, te avisamos ese mismo día.',
            },
            {
              question: '¿Qué significan FOB y CIF?',
              answer:
                'FOB es el precio de la mercadería puesta en el puerto de origen: de ahí en adelante el flete y el seguro corren por tu cuenta. CIF ya los incluye hasta el puerto de destino. Nosotros te cotizamos las dos formas para que compares.',
            },
            {
              question: '¿Puedo traer poca cantidad?',
              answer:
                'Sí. Consolidamos carga de varios clientes en un mismo contenedor, así podés traer desde una caja sin pagar un contenedor entero.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'smartfox',
    name: 'SmartFox',
    category: 'Marcas del grupo',
    description: 'Bloques verde bosque y negro asfalto, esquinas rectas y amarillo solo para el precio.',
    tokens: {
      // Verde bosque #195A3A.
      colorPrimary: '25 90 58',
      colorPrimaryHover: '18 68 43',
      colorBg: '255 255 255',
      // Gris cemento #ECEBE8: fondo de fotos de producto y secciones claras.
      colorBgSubtle: '236 235 232',
      // Negro asfalto #231F20.
      colorFg: '35 31 32',
      // Amarillo ruta #FFC72C: precios y llamados a la acción. Solo sobre
      // negro o verde, o de fondo con texto negro. Nunca sobre blanco (1.6:1).
      colorAccent: '255 199 44',
    },
    // "Esquinas siempre rectas: ni bloques, ni botones, ni fotos llevan bordes
    // redondeados". Es una regla de la guía, no una preferencia.
    borderRadius: 'sharp',
    density: 'cozy',
    motion: 'subtle',
    iconKit: 'tabler',
    fonts: { heading: 'montserrat', body: 'barlow' },
    // "Cartel negro con el logo principal grande a la izquierda". Sobre negro,
    // el bloque FOX se funde con el fondo: la guía lo permite y es el efecto.
    header: {
      layout: 'classic',
      border: 'none',
      showSearch: false,
      bg: '35 31 32',
      textColor: '255 255 255',
    },
    logo: '/marca/smartfox/smartfox-logo.svg',
    favicon: '/marca/smartfox/favicon.ico',
    seo: {
      title: 'SmartFox — Motos urbanas',
      description:
        'Motos para moverse todos los días: al laburo, a la facu, a repartir. Astuta por naturaleza.',
    },
    announcement: 'Repuestos en todo el país. La garantía la responde el importador, acá.',
    // Voz de la guía: datos antes que adjetivos, picardía sin chiste, y nunca
    // invitar a correr. Los valores entre corchetes se reemplazan por los
    // reales de cada modelo cuando se cargue la línea.
    sections: [
      { type: 'carousel', visible: true },
      { type: 'featured', visible: true, title: 'Modelos' },
      {
        type: 'image-text',
        visible: true,
        title: 'Para el que labura arriba de la moto',
        data: {
          title: 'Para el que labura arriba de la moto',
          description:
            'Poco consumo, service simple y repuestos en todo el país. Motos urbanas para moverse todos los días: al laburo, a la facu, a repartir. Hacé la cuenta.',
          buttonText: 'Ver modelos',
        },
      },
      {
        type: 'info-bar',
        visible: true,
        data: {
          items: [
            { icon: 'support', title: 'Service simple', description: 'Repuestos en todo el país' },
            { icon: 'security', title: 'Garantía local', description: 'La responde el importador, acá' },
            { icon: 'card', title: 'Precio claro', description: 'Precio final, cuotas y vigencia' },
          ],
        },
      },
      {
        type: 'faq',
        visible: true,
        title: 'Service, garantía y repuestos',
        data: {
          title: 'Service, garantía y repuestos',
          items: [
            {
              question: '¿Dónde hago el service?',
              answer:
                'En cualquier taller de la red. El service es simple y las piezas son estándar, así que no dependés de un único lugar.',
            },
            {
              question: '¿Quién responde la garantía?',
              answer:
                'El importador, acá en Argentina. No hay que mandar nada al exterior ni esperar una respuesta de otro país.',
            },
            {
              question: '¿Consigo repuestos?',
              answer: 'Sí, en todo el país. Es parte de por qué elegimos esta línea y no otra.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'volxen',
    name: 'Volxen',
    category: 'Marcas del grupo',
    description: 'Negro grafito y volt. Para equipamiento de gimnasio: contraste alto y nada decorativo.',
    tokens: {
      colorPrimary: '198 242 78',
      colorPrimaryHover: '176 219 60',
      colorBg: '14 15 18',
      colorBgSubtle: '26 28 33',
      colorFg: '244 245 247',
    },
    borderRadius: 'soft',
    density: 'cozy',
    motion: 'dynamic',
    iconKit: 'tabler',
    fonts: { heading: 'montserrat', body: 'barlow' },
    header: { layout: 'classic', border: 'none', showSearch: true },
    announcement: 'Equipamiento para entrenar en serio.',
    sections: [
      { type: 'carousel', visible: true },
      { type: 'category-banners', visible: true, title: 'Por disciplina' },
      { type: 'featured', visible: true, title: 'Lo más pedido' },
      {
        type: 'info-bar',
        visible: true,
        data: {
          items: [
            { icon: 'shipping', title: 'Envíos a todo el país' },
            { icon: 'security', title: 'Garantía escrita' },
            { icon: 'support', title: 'Asesoramiento para armar tu gimnasio' },
          ],
        },
      },
    ],
    comingSoon: {
      enabled: true,
      eyebrow: 'Muy pronto',
      title: 'Volxen está por abrir',
      message: 'Equipamiento de gimnasio para entrenar en serio, con envío a todo el país.',
    },
  },
  {
    id: 'canicari',
    name: 'Canicari',
    category: 'Marcas del grupo',
    description: 'Verde agua y crema, formas redondas. Para mascotas: cercano y tranquilo.',
    tokens: {
      colorPrimary: '13 148 136',
      colorPrimaryHover: '10 120 110',
      colorBg: '255 253 250',
      colorBgSubtle: '240 247 245',
      colorFg: '28 44 41',
    },
    borderRadius: 'rounded',
    density: 'spacious',
    motion: 'subtle',
    iconKit: 'phosphor',
    fonts: { heading: 'poppins', body: 'dmsans' },
    header: { layout: 'classic', border: 'line', showSearch: true },
    announcement: 'Todo para tu mascota, a la puerta de tu casa.',
    sections: [
      { type: 'carousel', visible: true },
      { type: 'category-banners', visible: true, title: 'Perros, gatos y más' },
      { type: 'featured', visible: true, title: 'Destacados' },
      {
        type: 'info-bar',
        visible: true,
        data: {
          items: [
            { icon: 'shipping', title: 'Envío a domicilio' },
            { icon: 'returns', title: 'Cambios sin vueltas' },
            { icon: 'support', title: 'Te ayudamos a elegir' },
          ],
        },
      },
      {
        type: 'newsletter',
        visible: true,
        title: 'Novedades y ofertas',
        data: { title: 'Novedades y ofertas', text: 'Dejanos tu email y te avisamos de las promos.' },
      },
    ],
    comingSoon: {
      enabled: true,
      eyebrow: 'Muy pronto',
      title: 'Canicari está en camino',
      message: 'Alimento, juguetes y accesorios para tu mascota. Estamos preparando todo.',
    },
  },
];

/** Luminancia relativa aproximada (0 oscuro → 1 claro) de un color "R G B". */
function luminance(rgbRaw: string): number {
  const [r, g, b] = rgbRaw.trim().split(/\s+/).map(Number);
  return (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
}

/**
 * Header del preset con contraste garantizado en cualquier paleta:
 * - tema claro → barra "tinta" (colorFg) con texto claro (colorBg).
 * - tema oscuro → barra de superficie oscura (colorBgSubtle) con texto claro (colorFg).
 */
export function presetHeader(t: ThemePreset['tokens']): { bg: string; textColor: string } {
  const dark = luminance(t.colorBg) < 0.5;
  return dark ? { bg: t.colorBgSubtle, textColor: t.colorFg } : { bg: t.colorFg, textColor: t.colorBg };
}

/**
 * Convierte un preset (DSL compacto de la galería) al ThemeConfig actual.
 *
 * Lo que el preset no trae queda como estaba: los presets genéricos siguen
 * dando el mismo resultado de siempre. Los de marca sí traen tipografía, forma
 * de los bordes, kit de íconos y hasta la página de espera, porque una guía de
 * marca no es una paleta: con los colores bien y los bordes redondeados, una
 * identidad de bloques rectos ya no es esa identidad.
 */
export function presetToConfig(preset: ThemePreset) {
  const typeMap: Record<string, string> = {
    hero: 'carousel',
    'featured-products': 'featured',
    'info-bar': 'info-bar',
    newsletter: 'newsletter',
  };
  const hdr = presetHeader(preset.tokens);
  return {
    colors: {
      primary: preset.tokens.colorPrimary,
      accent: preset.tokens.colorAccent ?? '27 21 16',
      useAccent: !!preset.tokens.colorAccent,
      bg: preset.tokens.colorBg,
      text: preset.tokens.colorFg,
    },
    fonts: preset.fonts ?? { heading: 'sans', body: 'sans' },
    ...(preset.borderRadius ? { borderRadius: preset.borderRadius } : {}),
    ...(preset.density ? { density: preset.density } : {}),
    ...(preset.motion ? { motion: preset.motion } : {}),
    ...(preset.iconKit ? { iconKit: preset.iconKit } : {}),
    ...(preset.seo ? { seoTitle: preset.seo.title, seoDescription: preset.seo.description } : {}),
    ...(preset.logo ? { logo: preset.logo } : {}),
    ...(preset.favicon ? { favicon: preset.favicon } : {}),
    ...(preset.comingSoon ? { comingSoon: preset.comingSoon } : {}),
    header: {
      bg: hdr.bg,
      textColor: hdr.textColor,
      sticky: true,
      logoSize: 'md',
      showTabsMobile: false,
      ...preset.header,
    },
    announcement: preset.announcement
      ? { show: true, animation: 'static', items: [{ text: preset.announcement, link: '' }] }
      : { show: false, animation: 'static', items: [] },
    sections: preset.sections.map((s, i) => ({
      id: `${typeMap[s.type] ?? s.type}-${i}`,
      type: typeMap[s.type] ?? s.type,
      visible: s.visible,
      // El contenido del preset manda sobre los defaults: una sección de marca
      // trae sus preguntas, sus items y su texto ya escritos.
      data: { title: s.title ?? '', images: [], carousel: true, ...s.data },
    })),
  };
}
