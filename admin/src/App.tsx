import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { CommandPalette } from './components/CommandPalette';
import { SettingsLayout } from './pages/Settings/SettingsLayout';
import { PaymentMethodsPage } from './pages/Settings/PaymentMethods';
import { ShippingMethodsPage } from './pages/Settings/ShippingMethods';
import { AutoEmailsPage } from './pages/Settings/AutoEmails';
import { WhatsAppAutoPage } from './pages/Settings/WhatsAppAuto';
import { CheckoutOptionsPage } from './pages/Settings/CheckoutOptions';
import { FiscalInvoicingPage } from './pages/Settings/FiscalInvoicing';
import { DomainsPage } from './pages/Settings/Domains';
import { UsersNotificationsPage } from './pages/Settings/UsersNotifications';
import {
  DistributionCentersPage,
  ExternalCodesPage,
  LanguagesCurrenciesPage,
  RedirectsPage,
  CustomFieldsPage,
} from './pages/Settings/MiscPages';
import { HomePage } from './pages/Home';
import { ProductsPage } from './pages/Products';
import { CategoriesPage } from './pages/Products/Categories';
import { InventoryPage } from './pages/Products/Inventory';
import { CostsPage } from './pages/Products/Costs';
import { ExportImportPage } from './pages/Products/ExportImport';
import { NewProductPage } from './pages/Products/NewProduct';
import { EditProductPage } from './pages/Products/EditProduct';
import { DiscountsPage } from './pages/Discounts';
import { MarketingPage } from './pages/Marketing';
import { MercadoLibrePage } from './pages/MercadoLibre';
import { MeliSettingsPage } from './pages/Settings/MercadoLibre';
import { CustomersPage } from './pages/Customers';
import { MessagesPage } from './pages/Messages';
import { SupportChatPage } from './pages/SupportChat';
import { OrdersPage } from './pages/Orders';
import { AbandonedCartsPage } from './pages/AbandonedCarts';
import { HelpArticlePage, HelpIndexPage } from './pages/Help';
import { PagesPage } from './pages/Pages';
// El editor de diseño (+ galería) es el chunk más pesado del admin y solo se usa
// en /canales/tienda-online → lazy para sacarlo del bundle inicial.
const ThemeEditorPage = lazy(() => import('./pages/ThemeEditor'));
const ThemeGalleryPage = lazy(() => import('./pages/ThemeGallery'));
import { TenantsPage } from './pages/Tenants';
import { StatsOverviewPage } from './pages/Stats/Overview';
import { StatsProductsPage } from './pages/Stats/Products';
import { StatsSalesPage } from './pages/Stats/SalesCustomers';
import { StatsProfitabilityPage } from './pages/Stats/Profitability';
import { StatsVisitsPage } from './pages/Stats/Visits';
import { StatsRealTimePage } from './pages/Stats/RealTime';
import { StatsCouponsPage } from './pages/Stats/Coupons';
import { StubPage, stubs } from './pages/Stub';
import { RequirePerm } from './context/PermissionsContext';

/** Tabla de rutas: path + permiso + elemento (el boilerplate de <RequirePerm> se arma al render). */
interface AppRoute {
  path: string;
  perm?: string | string[];
  el: ReactNode;
}

const lazyFallback = (label: string) => <p className="py-16 text-center text-sm text-fg-muted">{label}</p>;

// Rutas del panel principal (AdminLayout).
const MAIN_ROUTES: AppRoute[] = [
  { path: '/', el: <HomePage /> },

  // Estadísticas
  { path: '/estadisticas', perm: 'stats.read', el: <StatsOverviewPage /> },
  { path: '/estadisticas/productos', perm: 'stats.read', el: <StatsProductsPage /> },
  { path: '/estadisticas/ventas', perm: 'stats.read', el: <StatsSalesPage /> },
  { path: '/estadisticas/rentabilidad', perm: 'stats.read', el: <StatsProfitabilityPage /> },
  { path: '/estadisticas/visitas', perm: 'stats.read', el: <StatsVisitsPage /> },
  { path: '/estadisticas/tiempo-real', perm: 'stats.read', el: <StatsRealTimePage /> },
  { path: '/estadisticas/cupones', perm: 'stats.read', el: <StatsCouponsPage /> },

  // Productos
  { path: '/productos', perm: ['inventory.read', 'catalog.write'], el: <ProductsPage /> },
  { path: '/productos/nuevo', perm: 'catalog.write', el: <NewProductPage /> },
  { path: '/productos/:id/editar', perm: 'catalog.write', el: <EditProductPage /> },
  { path: '/productos/exportar-importar', perm: 'catalog.write', el: <ExportImportPage /> },
  { path: '/productos/categorias', perm: 'catalog.write', el: <CategoriesPage /> },
  { path: '/productos/inventario', perm: 'inventory.read', el: <InventoryPage /> },
  { path: '/productos/costos', perm: 'catalog.write', el: <CostsPage /> },

  // Tienda online (chunks lazy)
  {
    path: '/canales/tienda-online',
    perm: 'content.write',
    el: (
      <Suspense fallback={lazyFallback('Cargando editor...')}>
        <ThemeEditorPage />
      </Suspense>
    ),
  },
  {
    path: '/canales/tienda-online/disenios',
    perm: 'content.write',
    el: (
      <Suspense fallback={lazyFallback('Cargando...')}>
        <ThemeGalleryPage />
      </Suspense>
    ),
  },

  // Ventas y el resto del panel
  { path: '/ventas', perm: 'orders.read', el: <OrdersPage /> },
  { path: '/ventas/carritos', perm: 'orders.read', el: <AbandonedCartsPage /> },
  { path: '/descuentos', perm: 'discounts.read', el: <DiscountsPage /> },
  { path: '/marketing', perm: 'settings.write', el: <MarketingPage /> },
  { path: '/mercadolibre', perm: 'orders.read', el: <MercadoLibrePage /> },
  { path: '/clientes', perm: 'customers.read', el: <CustomersPage /> },
  { path: '/mensajes', perm: 'messages.read', el: <MessagesPage /> },
  { path: '/posventa', perm: 'support.chat', el: <SupportChatPage /> },
  { path: '/paginas', perm: 'content.write', el: <PagesPage /> },
  { path: '/tenants', el: <TenantsPage /> },
];

// Rutas de Configuración (SettingsLayout, paths relativos).
const SETTINGS_ROUTES: AppRoute[] = [
  { path: 'medios-de-pago', perm: 'payments.read', el: <PaymentMethodsPage /> },
  { path: 'medios-de-envio', perm: 'settings.write', el: <ShippingMethodsPage /> },
  { path: 'mercadolibre', perm: 'settings.write', el: <MeliSettingsPage /> },
  { path: 'centros-de-distribucion', perm: 'settings.write', el: <DistributionCentersPage /> },
  { path: 'emails-automaticos', perm: 'settings.write', el: <AutoEmailsPage /> },
  { path: 'whatsapp-automatico', perm: 'settings.write', el: <WhatsAppAutoPage /> },
  { path: 'opciones-del-checkout', perm: 'settings.write', el: <CheckoutOptionsPage /> },
  { path: 'facturacion', perm: 'fiscal.config', el: <FiscalInvoicingPage /> },
  { path: 'usuarios', perm: 'members.read', el: <UsersNotificationsPage /> },
  { path: 'dominios', perm: 'settings.write', el: <DomainsPage /> },
  { path: 'codigos-externos', perm: 'settings.write', el: <ExternalCodesPage /> },
  { path: 'idiomas-y-monedas', perm: 'settings.write', el: <LanguagesCurrenciesPage /> },
  { path: 'redirecciones', perm: 'settings.write', el: <RedirectsPage /> },
  { path: 'campos-personalizados', perm: 'settings.write', el: <CustomFieldsPage /> },
];

const renderRoute = (r: AppRoute) => (
  <Route
    key={r.path}
    path={r.path}
    element={r.perm ? <RequirePerm perm={r.perm}>{r.el}</RequirePerm> : r.el}
  />
);

export default function App() {
  return (
    <>
      {/* Ctrl/Cmd+K en cualquier pantalla del admin. */}
      <CommandPalette />
      <Routes>
        <Route element={<AdminLayout />}>
          {MAIN_ROUTES.map(renderRoute)}
          {Object.keys(stubs).map((id) => (
            <Route key={id} path={`/${id}`} element={<StubPage id={id} />} />
          ))}
        </Route>

        {/* Configuración: layout propio con su nav lateral */}
        <Route path="/configuracion" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/configuracion/medios-de-pago" replace />} />
          {SETTINGS_ROUTES.map(renderRoute)}
        </Route>

        {/* Centro de ayuda (standalone, sin sidebar — se abre en pestaña nueva). */}
        <Route path="/ayuda" element={<HelpIndexPage />} />
        <Route path="/ayuda/:topic" element={<HelpArticlePage />} />

        <Route element={<AdminLayout />}>
          <Route path="*" element={<StubPage id="aplicaciones" />} />
        </Route>
      </Routes>
    </>
  );
}
