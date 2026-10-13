import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { foldText } from '../lib/text';

/**
 * Buscador de opciones del editor de diseño.
 *
 * El editor tiene catorce paneles y casi cien controles. Acordarse de que el
 * descuento por transferencia vive en "Detalle de producto" y no en "Colores"
 * es trabajo que no le toca al comercio: se escribe "transferencia" y listo.
 */
export interface OptionEntry {
  /** Cómo se llama la opción en su panel. */
  label: string;
  /** Panel donde vive (la vista del editor). */
  view: string;
  /** Nombre del panel, para ubicarse. */
  panel: string;
  /** Palabras con las que alguien podría buscarla sin saber cómo se llama. */
  keywords?: string;
}

export const OPTION_INDEX: OptionEntry[] = [
  { label: 'Logo de la tienda', view: 'logo', panel: 'Identidad', keywords: 'marca imagen isologo' },
  { label: 'Favicon', view: 'logo', panel: 'Identidad', keywords: 'icono pestaña navegador' },
  {
    label: 'Imagen al compartir',
    view: 'logo',
    panel: 'Identidad',
    keywords: 'whatsapp redes og preview link',
  },
  {
    label: 'Título para buscadores',
    view: 'logo',
    panel: 'Identidad',
    keywords: 'google seo posicionamiento',
  },
  { label: 'Descripción para buscadores', view: 'logo', panel: 'Identidad', keywords: 'google seo meta' },

  { label: 'Color principal', view: 'colors', panel: 'Colores', keywords: 'botones marca primario' },
  { label: 'Color de acento', view: 'colors', panel: 'Colores', keywords: 'secundario' },
  { label: 'Color de fondo', view: 'colors', panel: 'Colores', keywords: 'background claro oscuro' },
  { label: 'Color de textos', view: 'colors', panel: 'Colores', keywords: 'letras contraste legible' },
  { label: 'Paletas listas', view: 'colors', panel: 'Colores', keywords: 'combinaciones presets' },

  { label: 'Tipo de letra', view: 'fonts', panel: 'Tipografía', keywords: 'fuente tipografia font titulos' },

  { label: 'Bordes', view: 'radius', panel: 'Estilo global', keywords: 'redondeado cuadrado esquinas' },
  { label: 'Íconos', view: 'radius', panel: 'Estilo global', keywords: 'iconos estilo carrito corazon' },
  {
    label: 'Movimiento',
    view: 'radius',
    panel: 'Estilo global',
    keywords: 'animaciones transiciones scroll',
  },
  { label: 'Densidad', view: 'radius', panel: 'Estilo global', keywords: 'espaciado aire compacto amplio' },

  {
    label: 'Disposición del encabezado',
    view: 'header',
    panel: 'Encabezado',
    keywords: 'layout logo centro menu',
  },
  { label: 'Color del encabezado', view: 'header', panel: 'Encabezado', keywords: 'fondo barra superior' },
  { label: 'Encabezado transparente', view: 'header', panel: 'Encabezado', keywords: 'inmersivo foto hero' },
  {
    label: 'Encabezado fijo al navegar',
    view: 'header',
    panel: 'Encabezado',
    keywords: 'sticky pegado scroll',
  },
  {
    label: 'Menú: mostrar, ocultar y ordenar',
    view: 'header',
    panel: 'Encabezado',
    keywords: 'navegacion links paginas orden',
  },
  { label: 'Buscador en el encabezado', view: 'header', panel: 'Encabezado', keywords: 'lupa buscar' },
  { label: 'Carrito en el encabezado', view: 'header', panel: 'Encabezado', keywords: 'icono carrito texto' },
  {
    label: 'Barra de anuncio',
    view: 'header',
    panel: 'Encabezado',
    keywords: 'promo envio gratis marquesina cupon',
  },

  {
    label: 'Secciones del inicio',
    view: 'home',
    panel: 'Página de inicio',
    keywords: 'home banners carrusel destacados orden',
  },
  { label: 'Preguntas frecuentes', view: 'home', panel: 'Página de inicio', keywords: 'faq dudas' },
  { label: 'Testimonios', view: 'home', panel: 'Página de inicio', keywords: 'opiniones reseñas clientes' },
  {
    label: 'Sección de novedades',
    view: 'home',
    panel: 'Página de inicio',
    keywords: 'newsletter suscripcion email',
  },

  {
    label: 'Orden con el que abre el listado',
    view: 'products-list',
    panel: 'Listado',
    keywords: 'ordenar precio nuevos',
  },
  { label: 'Productos por página', view: 'products-list', panel: 'Listado', keywords: 'paginacion cuantos' },
  { label: 'Productos por fila', view: 'products-list', panel: 'Listado', keywords: 'columnas grilla' },
  {
    label: 'Proporción de las fotos',
    view: 'products-list',
    panel: 'Listado',
    keywords: 'cuadrada vertical apaisada aspecto',
  },
  {
    label: 'Presentación de cada producto',
    view: 'products-list',
    panel: 'Listado',
    keywords: 'tarjeta card marco',
  },
  {
    label: 'Filtros del listado',
    view: 'products-list',
    panel: 'Listado',
    keywords: 'categorias precio marca color talle',
  },
  {
    label: 'Disponibilidad en las cards',
    view: 'products-list',
    panel: 'Listado',
    keywords: 'stock ultimas sin stock',
  },

  { label: 'Estilo de galería', view: 'product-detail', panel: 'Detalle', keywords: 'fotos miniaturas' },
  {
    label: 'Cuotas sin interés',
    view: 'product-detail',
    panel: 'Detalle',
    keywords: 'financiacion pagos tarjeta',
  },
  {
    label: 'Descuento por transferencia o efectivo',
    view: 'product-detail',
    panel: 'Detalle',
    keywords: 'efectivo transferencia descuento precio',
  },
  {
    label: 'Consultar por WhatsApp',
    view: 'product-detail',
    panel: 'Detalle',
    keywords: 'chat consulta vendedor',
  },
  {
    label: 'Medios de pago en el producto',
    view: 'product-detail',
    panel: 'Detalle',
    keywords: 'logos tarjetas visa',
  },
  {
    label: 'Productos relacionados',
    view: 'product-detail',
    panel: 'Detalle',
    keywords: 'sugeridos tambien te puede gustar',
  },

  { label: 'Texto del botón de compra', view: 'cart', panel: 'Carrito', keywords: 'checkout iniciar compra' },
  { label: 'Campo de cupón', view: 'cart', panel: 'Carrito', keywords: 'descuento codigo promo' },
  {
    label: 'Barra de envío gratis',
    view: 'cart',
    panel: 'Carrito',
    keywords: 'minimo envio gratis progreso',
  },
  {
    label: 'Productos sugeridos en el carrito',
    view: 'cart',
    panel: 'Carrito',
    keywords: 'cross sell sumar',
  },
  { label: 'Mensaje para clientes', view: 'cart', panel: 'Carrito', keywords: 'aviso aclaracion' },

  {
    label: 'Botón flotante de WhatsApp',
    view: 'whatsapp',
    panel: 'WhatsApp',
    keywords: 'chat numero mensaje',
  },

  {
    label: 'Datos de contacto',
    view: 'contact',
    panel: 'Contacto',
    keywords: 'direccion telefono email whatsapp local',
  },
  { label: 'Formulario de contacto', view: 'contact', panel: 'Contacto', keywords: 'mensajes consultas' },

  {
    label: 'Redes sociales',
    view: 'footer',
    panel: 'Pie de página',
    keywords: 'instagram facebook tiktok youtube x twitter',
  },
  {
    label: 'Logos de medios de pago',
    view: 'footer',
    panel: 'Pie de página',
    keywords: 'tarjetas visa mastercard mercado pago',
  },
  {
    label: 'Suscripción a novedades',
    view: 'footer',
    panel: 'Pie de página',
    keywords: 'newsletter email lista',
  },
  {
    label: 'Links a páginas de contenido',
    view: 'footer',
    panel: 'Pie de página',
    keywords: 'como comprar preguntas envios',
  },
  {
    label: 'Contacto en el pie',
    view: 'footer',
    panel: 'Pie de página',
    keywords: 'telefonos direcciones emails whatsapps',
  },

  { label: 'CSS personalizado', view: 'css', panel: 'Avanzado', keywords: 'codigo estilos avanzado' },
  {
    label: 'Tienda en construcción',
    view: 'coming-soon',
    panel: 'Avanzado',
    keywords: 'proximamente cerrada avisame apertura',
  },
];

/** Sin acentos y en minúscula: "diseño" tiene que encontrarse escribiendo "diseno". */

export function searchOptions(query: string, index = OPTION_INDEX): OptionEntry[] {
  const q = foldText(query.trim());
  if (!q) return [];
  const terms = q.split(/\s+/);
  return index
    .filter((e) => {
      const hay = foldText(`${e.label} ${e.panel} ${e.keywords ?? ''}`);
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, 12);
}

export function OptionSearch({ onPick, onClose }: { onPick: (view: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchOptions(q), [q]);

  useEffect(() => inputRef.current?.focus(), []);

  const pick = (entry: OptionEntry) => {
    onPick(entry.view);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-fg-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0); // otra búsqueda, otra lista: se arranca por el primero
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && results[active]) {
                pick(results[active]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Buscar una opción: cuotas, logo, cupón, menú…"
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {q && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-fg-muted">
              Nada con «{q}». Probá con otra palabra.
            </p>
          )}
          {!q && (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">
              Escribí qué querés cambiar y te llevo al panel.
            </p>
          )}
          {results.map((entry, i) => (
            <button
              key={`${entry.view}-${entry.label}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(entry)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm',
                i === active ? 'bg-primary text-primary-fg' : 'text-fg hover:bg-bg-muted',
              )}
            >
              <span className="truncate">{entry.label}</span>
              <span className={cn('shrink-0 text-xs', i === active ? 'opacity-80' : 'text-fg-subtle')}>
                {entry.panel}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
