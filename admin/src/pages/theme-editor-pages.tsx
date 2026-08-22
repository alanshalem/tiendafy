import { AlertTriangle } from 'lucide-react';
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
} from './theme-editor-inputs';

export type PanelProps = {
  theme: ThemeConfig;
  onBack: () => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
};

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
        <Field label="Orden con el que abre" hint="Tu cliente lo puede cambiar desde el listado.">
          <Select
            value={theme.productList.defaultSort}
            onChange={(v) => set({ defaultSort: v as ThemeConfig['productList']['defaultSort'] })}
            options={[
              { value: 'newest', label: 'Más nuevos primero' },
              { value: 'price_asc', label: 'Menor precio primero' },
              { value: 'price_desc', label: 'Mayor precio primero' },
              { value: 'name', label: 'Nombre A-Z' },
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
        <Field label="Productos por fila">
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
        <Field label="Estilo de galería">
          <Select
            value={theme.productDetail.galleryStyle}
            onChange={(v) => set({ galleryStyle: v as ThemeConfig['productDetail']['galleryStyle'] })}
            options={[
              { value: 'thumbs', label: 'Miniaturas abajo' },
              { value: 'thumbs-left', label: 'Miniaturas verticales' },
            ]}
          />
        </Field>
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
          Mientras esté activo, los visitantes ven una página de “Próximamente” en lugar de la tienda. Vos
          podés seguir viéndola y editándola con la vista previa. Acordate de <strong>publicar</strong> para
          que el cambio se aplique.
        </p>
        <Field label="Título">
          <TextInput
            value={theme.comingSoon.title}
            onChange={(v) => set({ title: v })}
            placeholder="Estamos en construcción"
          />
        </Field>
        <Field label="Mensaje">
          <TextInput
            value={theme.comingSoon.message}
            onChange={(v) => set({ message: v })}
            placeholder="Volvemos muy pronto con la tienda."
          />
        </Field>
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
        <Field label="Texto del botón de checkout">
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
