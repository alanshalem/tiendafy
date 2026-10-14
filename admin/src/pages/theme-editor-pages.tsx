import { AlertTriangle } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { type ThemeConfig } from '@tiendafy/types';
import { HelpLink } from '../components/HelpLink';
import {
  BackHeader,
  Field,
  Check,
  Select,
  TextInput,
  TextArea,
  sectionSetter,
  useSectionReset,
  QuickStyles,
  SegField,
  type QuickStyle,
} from './theme-editor-inputs';
import { MediaUpload } from '../components/upload/MediaUpload';

export type PanelProps = {
  theme: ThemeConfig;
  onBack: () => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
};

const LIST_PRESETS: QuickStyle<ThemeConfig['productList']>[] = [
  {
    name: 'Vitrina',
    recommended: true,
    patch: {
      columns: 3,
      imageRatio: 'portrait',
      cardStyle: 'plain',
      showBuyButton: true,
      showCompareAt: true,
      showStockBadge: false,
    },
  },
  {
    name: 'Catálogo',
    patch: {
      columns: 4,
      imageRatio: 'square',
      cardStyle: 'boxed',
      showBuyButton: false,
      showCompareAt: true,
      showStockBadge: true,
    },
  },
  {
    name: 'Compacto',
    patch: {
      columns: 4,
      imageRatio: 'square',
      cardStyle: 'plain',
      showBuyButton: false,
      showCompareAt: false,
      showStockBadge: false,
    },
  },
];

const DETAIL_PRESETS: QuickStyle<ThemeConfig['productDetail']>[] = [
  {
    name: 'Simple',
    recommended: true,
    patch: {
      galleryStyle: 'thumbs',
      showSku: false,
      showStock: true,
      showRelated: true,
      showPaymentLogos: false,
      askWhatsApp: false,
    },
  },
  {
    name: 'Vendedor',
    patch: {
      galleryStyle: 'thumbs-left',
      showSku: true,
      showStock: true,
      showRelated: true,
      showPaymentLogos: true,
      askWhatsApp: true,
    },
  },
];

const CART_PRESETS: QuickStyle<ThemeConfig['cart']>[] = [
  {
    name: 'Directo',
    recommended: true,
    patch: { showSuggested: false, showCoupon: false, showContinue: true, freeShippingBar: false },
  },
  {
    name: 'Con incentivos',
    patch: { showSuggested: true, showCoupon: true, showContinue: true, freeShippingBar: true },
  },
];

export function ProductListPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'productList');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader
        title="Listado de productos"
        onBack={onBack}
        onReset={reset('productList', 'el listado de productos')}
      />
      <div className="space-y-4 p-4">
        <QuickStyles presets={LIST_PRESETS} current={theme.productList} onApply={set} />
        <Field label="Orden con el que abre" hint="Tu cliente lo puede cambiar desde el listado.">
          <Select
            value={theme.productList.defaultSort}
            onChange={(v) => set({ defaultSort: v as ThemeConfig['productList']['defaultSort'] })}
            options={[
              { value: 'newest', label: 'Más nuevos primero' },
              { value: 'price_asc', label: 'Menor precio primero' },
              { value: 'price_desc', label: 'Mayor precio primero' },
              { value: 'name', label: 'Nombre A-Z' },
              { value: 'best_sellers', label: 'Más vendidos primero' },
            ]}
          />
        </Field>
        <Field
          label="Productos por página"
          hint="Más productos por página = menos clicks, pero más lento en celular."
        >
          <Select
            value={String(theme.productList.pageSize)}
            onChange={(v) => set({ pageSize: Number(v) })}
            options={[12, 24, 48].map((n) => ({ value: String(n), label: `${n} productos` }))}
          />
        </Field>
        <Field label="Productos por fila en la computadora">
          <Select
            value={String(theme.productList.columns)}
            onChange={(v) => set({ columns: Number(v) })}
            options={[
              { value: '2', label: '2 columnas' },
              { value: '3', label: '3 columnas' },
              { value: '4', label: '4 columnas' },
            ]}
          />
        </Field>
        <Field
          label="Productos por fila en el celular"
          hint="Con 1 cada foto ocupa todo el ancho: luce más, pero hay que scrollear más."
        >
          <Select
            value={String(theme.productList.mobileColumns ?? 2)}
            onChange={(v) => set({ mobileColumns: v === '1' ? 1 : 2 })}
            options={[
              { value: '2', label: '2 columnas' },
              { value: '1', label: '1 columna (foto grande)' },
            ]}
          />
        </Field>
        <Field label="Proporción de las fotos" hint="Vertical le queda bien a la indumentaria.">
          <Select
            value={theme.productList.imageRatio}
            onChange={(v) => set({ imageRatio: v as ThemeConfig['productList']['imageRatio'] })}
            options={[
              { value: 'square', label: 'Cuadrada (1:1)' },
              { value: 'portrait', label: 'Vertical (3:4)' },
              { value: 'wide', label: 'Apaisada (4:3)' },
            ]}
          />
        </Field>
        <Field label="Presentación de cada producto">
          <Select
            value={theme.productList.cardStyle}
            onChange={(v) => set({ cardStyle: v as ThemeConfig['productList']['cardStyle'] })}
            options={[
              { value: 'plain', label: 'Suelto sobre el fondo' },
              { value: 'boxed', label: 'Dentro de una tarjeta' },
            ]}
          />
        </Field>
        <Check
          label="Mostrar precio"
          checked={theme.productList.showPrice}
          onChange={(v) => set({ showPrice: v })}
        />
        <Check
          label="Mostrar precio tachado (promo)"
          checked={theme.productList.showCompareAt}
          onChange={(v) => set({ showCompareAt: v })}
        />
        <Check
          label="Mostrar botón 'Agregar al carrito'"
          checked={theme.productList.showBuyButton}
          onChange={(v) => set({ showBuyButton: v })}
        />
        <Check
          label="Mostrar disponibilidad (stock)"
          checked={theme.productList.showStockBadge}
          onChange={(v) => set({ showStockBadge: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          Muestra «Sin stock» o «¡Últimas N!» en las cards. Activalo solo si controlás stock.
        </p>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Precio con transferencia y cuotas</div>
          <Check
            label="Mostrar precio con transferencia"
            checked={theme.productList.showCashPrice}
            onChange={(v) => set({ showCashPrice: v })}
          />
          <p className="mb-3 mt-1 text-xs text-fg-muted">
            Usa el % de descuento por transferencia de «Detalle de producto».
          </p>
          <Field label="Cuotas sin interés (0 = no mostrar)">
            <Select
              value={String(theme.productList.installmentsCount)}
              onChange={(v) => set({ installmentsCount: Number(v) })}
              options={[0, 3, 6, 9, 12].map((n) => ({
                value: String(n),
                label: n === 0 ? 'No mostrar' : `${n} cuotas`,
              }))}
            />
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold text-fg">Filtros del sidebar</div>
          <p className="mb-3 text-xs text-fg-muted">
            Cada filtro se muestra solo si tus productos tienen esos datos.
          </p>
          <Check
            label="Categorías"
            checked={theme.productList.filterCategories}
            onChange={(v) => set({ filterCategories: v })}
          />
          <Check
            label="Precio (Desde / Hasta)"
            checked={theme.productList.filterPrice}
            onChange={(v) => set({ filterPrice: v })}
          />
          <Check
            label="Marca"
            checked={theme.productList.filterBrand}
            onChange={(v) => set({ filterBrand: v })}
          />
          <Check
            label="Color / Talle y otras opciones"
            checked={theme.productList.filterOptions}
            onChange={(v) => set({ filterOptions: v })}
          />
        </div>
      </div>
    </div>
  );
}

export function ProductDetailPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'productDetail');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader
        title="Detalle de producto"
        onBack={onBack}
        onReset={reset('productDetail', 'el detalle de producto')}
      />
      <div className="space-y-4 p-4">
        <QuickStyles presets={DETAIL_PRESETS} current={theme.productDetail} onApply={set} />
        <GalleryStylePicker
          value={theme.productDetail.galleryStyle}
          onChange={(galleryStyle) => set({ galleryStyle })}
        />
        <Check
          label="Mostrar SKU"
          checked={theme.productDetail.showSku}
          onChange={(v) => set({ showSku: v })}
        />
        <Check
          label="Mostrar stock"
          checked={theme.productDetail.showStock}
          onChange={(v) => set({ showStock: v })}
        />
        <Check
          label="Mostrar productos relacionados"
          checked={theme.productDetail.showRelated}
          onChange={(v) => set({ showRelated: v })}
        />
        <Check
          label="Mostrar botón «Consultar por este producto»"
          checked={theme.productDetail.askWhatsApp}
          onChange={(v) => set({ askWhatsApp: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          Abre WhatsApp con el nombre del producto ya escrito. Usa el número del panel «Botón de WhatsApp»
          {theme.whatsappButton.phone ? '.' : ' — todavía sin cargar.'}
        </p>
        <Check
          label="Mostrar logos de medios de pago"
          checked={theme.productDetail.showPaymentLogos}
          onChange={(v) => set({ showPaymentLogos: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          Los mismos que elegiste en «Pie de página», pero al lado del botón de comprar.
        </p>

        <div className="border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-fg">Precio y financiación</div>
          <Field label="Cuotas sin interés (0 = no mostrar)">
            <Select
              value={String(theme.productDetail.installmentsCount)}
              onChange={(v) => set({ installmentsCount: Number(v) })}
              options={[0, 3, 6, 9, 12].map((n) => ({
                value: String(n),
                label: n === 0 ? 'No mostrar' : `${n} cuotas`,
              }))}
            />
          </Field>
        </div>

        <Field
          label="Descuento pagando en efectivo (%)"
          hint="0 = sin descuento. Se muestra como 'precio con EFECTIVO' acá y, si lo activaste, también en el listado."
        >
          <TextInput
            value={String(theme.productDetail.cashDiscountPercent || 0)}
            onChange={(v) =>
              set({ cashDiscountPercent: Math.max(0, Math.min(90, Number(v.replace(/\D/g, '')) || 0)) })
            }
            placeholder="10"
          />
        </Field>
      </div>
    </div>
  );
}

type GalleryStyle = ThemeConfig['productDetail']['galleryStyle'];

/**
 * Estilos de galería, cada uno con para qué sirve: los nombres solos
 * ("apilada", "miniaturas verticales") no le dicen nada a quien no armó
 * nunca una tienda. "Apilada" existía en la tienda pero el editor no la
 * ofrecía.
 */
const GALLERY_STYLES: { value: GalleryStyle; label: string; desc: string }[] = [
  {
    value: 'thumbs',
    label: 'Miniaturas abajo',
    desc: 'Una foto grande y las demás chiquitas debajo. La más común.',
  },
  {
    value: 'thumbs-left',
    label: 'Miniaturas al costado',
    desc: 'Las chiquitas en columna a la izquierda: deja más alto para la foto grande.',
  },
  {
    value: 'stacked',
    label: 'Apilada',
    desc: 'Todas las fotos grandes, una debajo de la otra. Ideal para indumentaria y productos con detalles.',
  },
];

function GalleryStylePicker({
  value,
  onChange,
}: {
  value: GalleryStyle;
  onChange: (v: GalleryStyle) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-fg">Estilo de galería</legend>
      <div className="grid gap-2">
        {GALLERY_STYLES.map((g) => {
          const active = value === g.value;
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange(g.value)}
              aria-pressed={active}
              className={cn(
                'min-h-10 rounded-lg border px-3 py-2 text-left transition',
                active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border-strong',
              )}
            >
              <span className="block text-sm font-medium text-fg">{g.label}</span>
              <span className="block text-xs text-fg-muted">{g.desc}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Muestra del diseño de la página en construcción: texto al centro, o imagen y texto. */
function ComingSoonSample({ split = false }: { split?: boolean }) {
  return (
    <span className="flex h-7 w-12 overflow-hidden rounded-sm border border-fg/20 bg-fg/5" aria-hidden>
      {split && <span className="w-1/2 bg-[#5d6878]" />}
      <span className="flex flex-1 flex-col items-center justify-center gap-0.5">
        <span className="h-1 w-5 rounded-full bg-fg/50" />
        <span className="h-0.5 w-4 rounded-full bg-fg/25" />
      </span>
    </span>
  );
}

export function ComingSoonPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'comingSoon');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader
        title="Tienda en construcción"
        onBack={onBack}
        onReset={reset('comingSoon', 'la tienda en construcción')}
      />
      <div className="space-y-4 p-4">
        <Check
          label="Activar modo en construcción"
          checked={theme.comingSoon.enabled}
          onChange={(v) => set({ enabled: v })}
        />
        <p className="text-xs text-fg-muted">
          Mientras esté activo, los visitantes ven esta página en lugar de la tienda (es la que ves ahora en
          la vista previa). Vos seguís viendo y editando la tienda desde acá. Acordate de{' '}
          <strong>publicar</strong> para que el cambio se aplique.
        </p>
        <Field label="Título">
          <TextInput
            value={theme.comingSoon.title}
            onChange={(v) => set({ title: v })}
            placeholder="Estamos en construcción"
          />
        </Field>
        <Field label="Mensaje">
          <TextArea
            rows={2}
            value={theme.comingSoon.message}
            onChange={(v) => set({ message: v })}
            placeholder="Volvemos muy pronto con la tienda."
          />
        </Field>
        <Field label="Etiqueta de arriba">
          <TextInput
            value={theme.comingSoon.eyebrow}
            onChange={(v) => set({ eyebrow: v })}
            placeholder="Próximamente"
          />
        </Field>
        <p className="-mt-2 text-xs text-fg-muted">El cartelito sobre el título. Vacío, no se muestra.</p>

        <SegField
          label="Diseño"
          columns={2}
          value={theme.comingSoon.layout}
          onChange={(layout) => set({ layout })}
          options={[
            { value: 'centered', label: 'Centrado', visual: <ComingSoonSample /> },
            { value: 'split', label: 'Imagen al costado', visual: <ComingSoonSample split /> },
          ]}
          hint={
            theme.comingSoon.layout === 'split' && !theme.comingSoon.image
              ? 'Imagen al costado necesita una imagen: sin ella se ve centrado.'
              : undefined
          }
        />

        <Field label="Imagen">
          <MediaUpload
            kind="comingSoon"
            value={theme.comingSoon.image}
            onChange={(url) => set({ image: url })}
          />
        </Field>
        <p className="-mt-2 text-xs text-fg-muted">
          Centrado la usa de fondo; dividido, en la mitad de la pantalla. Sin imagen queda el color de tu
          marca.
        </p>

        <Field label="Fecha de apertura">
          <TextInput
            value={theme.comingSoon.launchDate}
            onChange={(v) => set({ launchDate: v })}
            placeholder="2026-11-15"
            type="date"
          />
        </Field>
        <p className="-mt-2 text-xs text-fg-muted">
          Si la ponés, se anuncia en la página. Una fecha que después se corre hace más daño que no poner
          ninguna.
        </p>

        <Field label="WhatsApp para consultas">
          <TextInput
            value={theme.comingSoon.whatsapp}
            onChange={(v) => set({ whatsapp: v })}
            placeholder="5491122334455"
          />
        </Field>
        <p className="-mt-2 text-xs text-fg-muted">Vacío, usa el del pie de página si cargaste alguno.</p>

        <Check
          label="Mostrar mis redes"
          checked={theme.comingSoon.showSocial}
          onChange={(v) => set({ showSocial: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          Las que cargaste en «Pie de página». Mientras la tienda no abre, son el único lugar a donde mandar a
          quien llegó.
        </p>

        <Check
          label="Pedir el email para avisar cuando abras"
          checked={theme.comingSoon.collectEmails}
          onChange={(v) => set({ collectEmails: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          El que llegó antes de tiempo es tu primer cliente posible. Los emails quedan guardados y se pueden
          usar como audiencia en Email marketing.
        </p>
      </div>
    </div>
  );
}

export function CartPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'cart');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader title="Carrito de compras" onBack={onBack} onReset={reset('cart', 'el carrito')} />
      <div className="space-y-4 p-4">
        <QuickStyles presets={CART_PRESETS} current={theme.cart} onApply={set} />
        <p className="text-xs text-fg-muted">
          La vista previa abre el carrito con un producto de muestra, así ves cada opción.
        </p>
        <Field label="Texto del botón para pagar">
          <TextInput
            value={theme.cart.checkoutButtonText}
            onChange={(v) => set({ checkoutButtonText: v })}
            placeholder="Iniciar compra"
          />
        </Field>
        <Check
          label="Mostrar productos sugeridos"
          checked={theme.cart.showSuggested}
          onChange={(v) => set({ showSuggested: v })}
        />
        <Check
          label="Mostrar botón «Seguir comprando»"
          checked={theme.cart.showContinue}
          onChange={(v) => set({ showContinue: v })}
        />
        <Check
          label="Mostrar campo de cupón"
          checked={theme.cart.showCoupon}
          onChange={(v) => set({ showCoupon: v })}
        />
        <p className="-mt-2 text-xs text-fg-muted">
          Si no usás cupones, apagalo: un campo vacío hace que el cliente salga a buscar un código y a veces
          no vuelve.
        </p>
        <Field
          label="Mensaje para clientes"
          hint="Se muestra en el carrito (ej. aclaraciones de envío o pago). Vacío = no se muestra."
        >
          <TextArea value={theme.cart.notice} onChange={(v) => set({ notice: v })} />
        </Field>
        <Check
          label="Mostrar barra de envío gratis"
          checked={theme.cart.freeShippingBar}
          onChange={(v) => set({ freeShippingBar: v })}
        />
        {theme.cart.freeShippingBar && (
          <Field label="Mínimo para envío gratis (ARS)">
            <TextInput
              value={String(theme.cart.freeShippingThreshold / 100)}
              onChange={(v) => set({ freeShippingThreshold: Math.round(Number(v.replace(/\D/g, '')) * 100) })}
              placeholder="50000"
            />
          </Field>
        )}
      </div>
    </div>
  );
}

export function ContactPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'contact');
  const reset = useSectionReset(updateTheme);
  return (
    <div>
      <BackHeader title="Contacto" onBack={onBack} onReset={reset('contact', 'los datos de contacto')} />
      <div className="space-y-4 p-4">
        <p className="text-xs text-fg-muted">
          Estos datos salen en la <strong>página de Contacto</strong>. Los que aparecen en el{' '}
          <strong>pie de página</strong> se editan en «Pie de página».
        </p>
        <div className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-fg">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <p>
            Es obligatorio incluir estos datos en tu tienda, según la{' '}
            <a
              href="https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-104-2005-107456"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline hover:no-underline"
            >
              Resolución N° 104/2005 de Defensa del Consumidor
            </a>
            .
          </p>
        </div>
        <Check
          label="Mostrar formulario de contacto"
          checked={theme.contact.showForm}
          onChange={(v) => set({ showForm: v })}
        />
        <Field label="Dirección del local o showroom">
          <TextInput
            value={theme.contact.address}
            onChange={(v) => set({ address: v })}
            placeholder="Av. Corrientes 1234, CABA"
          />
        </Field>
        <Field label="Teléfono">
          <TextInput
            value={theme.contact.phone}
            onChange={(v) => set({ phone: v })}
            placeholder="+54 11 1234-5678"
          />
        </Field>
        <Field label="Email de la tienda">
          <TextInput
            value={theme.contact.email}
            onChange={(v) => set({ email: v })}
            placeholder="contacto@mitienda.com"
          />
        </Field>
        <Field label="WhatsApp">
          <TextInput
            value={theme.contact.whatsapp}
            onChange={(v) => set({ whatsapp: v })}
            placeholder="+54 9 11 1234 5678"
          />
        </Field>
        <HelpLink id="contact" className="mt-2" />
      </div>
    </div>
  );
}
