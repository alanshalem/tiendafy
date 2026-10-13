import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { CommandPalette } from './components/CommandPalette';
import { SettingsLayout } from './pages/Settings/SettingsLayout';
import { ScreenBoundary } from './components/ScreenBoundary';
import { lazyPage } from './lib/lazyPage';
import { RequirePerm, usePermissions } from './context/PermissionsContext';
import { firstSettingsPath, routePerm, SETTINGS_BASE } from './lib/access';

// Cada pantalla se baja recién cuando se abre (ver lib/lazyPage).
const PaymentMethodsPage = lazyPage(() => import('./pages/Settings/PaymentMethods'), 'PaymentMethodsPage');
const ShippingMethodsPage = lazyPage(() => import('./pages/Settings/ShippingMethods'), 'ShippingMethodsPage');
const AutoEmailsPage = lazyPage(() => import('./pages/Settings/AutoEmails'), 'AutoEmailsPage');
const WhatsAppAutoPage = lazyPage(() => import('./pages/Settings/WhatsAppAuto'), 'WhatsAppAutoPage');
const CheckoutOptionsPage = lazyPage(() => import('./pages/Settings/CheckoutOptions'), 'CheckoutOptionsPage');
const RedirectsPage = lazyPage(() => import('./pages/Settings/Redirects'), 'RedirectsPage');
const TrackingPage = lazyPage(() => import('./pages/Settings/Tracking'), 'TrackingPage');
const SpecFieldsPage = lazyPage(() => import('./pages/Settings/SpecFields'), 'SpecFieldsPage');
const FiscalInvoicingPage = lazyPage(() => import('./pages/Settings/FiscalInvoicing'), 'FiscalInvoicingPage');
const DomainsPage = lazyPage(() => import('./pages/Settings/Domains'), 'DomainsPage');
const UsersNotificationsPage = lazyPage(
  () => import('./pages/Settings/UsersNotifications'),
  'UsersNotificationsPage',
);
const RolesPage = lazyPage(() => import('./pages/Settings/Roles'), 'RolesPage');
const HomePage = lazyPage(() => import('./pages/Home'), 'HomePage');
const ProductsPage = lazyPage(() => import('./pages/Products'), 'ProductsPage');
const CategoriesPage = lazyPage(() => import('./pages/Products/Categories'), 'CategoriesPage');
const InventoryPage = lazyPage(() => import('./pages/Products/Inventory'), 'InventoryPage');
const CostsPage = lazyPage(() => import('./pages/Products/Costs'), 'CostsPage');
const PriceListsPage = lazyPage(() => import('./pages/Products/PriceLists'), 'PriceListsPage');
const ComprasPage = lazyPage(() => import('./pages/Compras'), 'ComprasPage');
const ProveedoresPage = lazyPage(() => import('./pages/Proveedores'), 'ProveedoresPage');
const TesoreriaPage = lazyPage(() => import('./pages/Tesoreria'), 'TesoreriaPage');
const CuentasCorrientesPage = lazyPage(() => import('./pages/CuentasCorrientes'), 'CuentasCorrientesPage');
const ScannerPage = lazyPage(() => import('./pages/Products/Scanner'), 'ScannerPage');
const KitsPage = lazyPage(() => import('./pages/Products/Kits'), 'KitsPage');
const ExportImportPage = lazyPage(() => import('./pages/Products/ExportImport'), 'ExportImportPage');
const NewProductPage = lazyPage(() => import('./pages/Products/NewProduct'), 'NewProductPage');
const EditProductPage = lazyPage(() => import('./pages/Products/EditProduct'), 'EditProductPage');
const DiscountsPage = lazyPage(() => import('./pages/Discounts'), 'DiscountsPage');
const MarketingPage = lazyPage(() => import('./pages/Marketing'), 'MarketingPage');
const MercadoLibrePage = lazyPage(() => import('./pages/MercadoLibre'), 'MercadoLibrePage');
const RedesPage = lazyPage(() => import('./pages/Redes'), 'RedesPage');
const MeliSettingsPage = lazyPage(() => import('./pages/Settings/MercadoLibre'), 'MeliSettingsPage');
const CustomersPage = lazyPage(() => import('./pages/Customers'), 'CustomersPage');
const MessagesPage = lazyPage(() => import('./pages/Messages'), 'MessagesPage');
const SupportChatPage = lazyPage(() => import('./pages/SupportChat'), 'SupportChatPage');
const OrdersPage = lazyPage(() => import('./pages/Orders'), 'OrdersPage');
const AbandonedCartsPage = lazyPage(() => import('./pages/AbandonedCarts'), 'AbandonedCartsPage');
const PresupuestosPage = lazyPage(() => import('./pages/Presupuestos'), 'PresupuestosPage');
const HelpArticlePage = lazyPage(() => import('./pages/Help'), 'HelpArticlePage');
const HelpIndexPage = lazyPage(() => import('./pages/Help'), 'HelpIndexPage');
const PagesPage = lazyPage(() => import('./pages/Pages'), 'PagesPage');
const TenantsPage = lazyPage(() => import('./pages/Tenants'), 'TenantsPage');
const StatsOverviewPage = lazyPage(() => import('./pages/Stats/Overview'), 'StatsOverviewPage');
const StatsProductsPage = lazyPage(() => import('./pages/Stats/Products'), 'StatsProductsPage');
const StatsSalesPage = lazyPage(() => import('./pages/Stats/SalesCustomers'), 'StatsSalesPage');
const StatsProfitabilityPage = lazyPage(
  () => import('./pages/Stats/Profitability'),
  'StatsProfitabilityPage',
);
const StatsVisitsPage = lazyPage(() => import('./pages/Stats/Visits'), 'StatsVisitsPage');
const StatsRealTimePage = lazyPage(() => import('./pages/Stats/RealTime'), 'StatsRealTimePage');
const StatsCouponsPage = lazyPage(() => import('./pages/Stats/Coupons'), 'StatsCouponsPage');
const NotFoundPage = lazyPage(() => import('./pages/NotFound'), 'NotFoundPage');
const ThemeEditorPage = lazyPage(() => import('./pages/ThemeEditor'), 'ThemeEditorPage');
const ThemeGalleryPage = lazyPage(() => import('./pages/ThemeGallery'), 'ThemeGalleryPage');

/**
 * Tabla de rutas: path + pantalla. El permiso de cada una sale de
 * lib/access (la misma tabla que usan los menús), y el <RequirePerm> se arma al render.
 */
interface AppRoute {
  path: string;
  el: ReactNode;
}

// Rutas del panel principal (AdminLayout).
const MAIN_ROUTES: AppRoute[] = [
  { path: '/', el: <HomePage /> },

  // Estadísticas
  { path: '/estadisticas', el: <StatsOverviewPage /> },
  { path: '/estadisticas/productos', el: <StatsProductsPage /> },
  { path: '/estadisticas/ventas', el: <StatsSalesPage /> },
  { path: '/estadisticas/rentabilidad', el: <StatsProfitabilityPage /> },
  { path: '/estadisticas/visitas', el: <StatsVisitsPage /> },
  { path: '/estadisticas/tiempo-real', el: <StatsRealTimePage /> },
  { path: '/estadisticas/cupones', el: <StatsCouponsPage /> },

  // Productos
  { path: '/productos', el: <ProductsPage /> },
  { path: '/productos/nuevo', el: <NewProductPage /> },
  { path: '/productos/:id/editar', el: <EditProductPage /> },
  { path: '/productos/exportar-importar', el: <ExportImportPage /> },
  { path: '/productos/categorias', el: <CategoriesPage /> },
  { path: '/productos/inventario', el: <InventoryPage /> },
  { path: '/productos/costos', el: <CostsPage /> },
  { path: '/productos/listas-de-precios', el: <PriceListsPage /> },
  { path: '/compras', el: <ComprasPage /> },
  { path: '/proveedores', el: <ProveedoresPage /> },
  { path: '/productos/escaner', el: <ScannerPage /> },
  { path: '/productos/kits', el: <KitsPage /> },

  // Tienda online
  { path: '/canales/tienda-online', el: <ThemeEditorPage /> },
  { path: '/canales/tienda-online/disenios', el: <ThemeGalleryPage /> },

  // Ventas y el resto del panel
  { path: '/ventas', el: <OrdersPage /> },
  { path: '/ventas/carritos', el: <AbandonedCartsPage /> },
  { path: '/presupuestos', el: <PresupuestosPage /> },
  { path: '/descuentos', el: <DiscountsPage /> },
  { path: '/marketing', el: <MarketingPage /> },
  { path: '/mercadolibre', el: <MercadoLibrePage /> },
  { path: '/redes', el: <RedesPage /> },
  { path: '/clientes', el: <CustomersPage /> },

  // Finanzas
  { path: '/tesoreria', el: <TesoreriaPage /> },
  { path: '/cuentas-corrientes', el: <CuentasCorrientesPage /> },
  { path: '/mensajes', el: <MessagesPage /> },
  { path: '/posventa', el: <SupportChatPage /> },
  { path: '/paginas', el: <PagesPage /> },
  { path: '/tenants', el: <TenantsPage /> },
];

// Rutas de Configuración (SettingsLayout, paths relativos).
const SETTINGS_ROUTES: AppRoute[] = [
  { path: 'medios-de-pago', el: <PaymentMethodsPage /> },
  { path: 'medios-de-envio', el: <ShippingMethodsPage /> },
  { path: 'mercadolibre', el: <MeliSettingsPage /> },
  { path: 'emails-automaticos', el: <AutoEmailsPage /> },
  { path: 'whatsapp-automatico', el: <WhatsAppAutoPage /> },
  { path: 'opciones-del-checkout', el: <CheckoutOptionsPage /> },
  { path: 'facturacion', el: <FiscalInvoicingPage /> },
  { path: 'usuarios', el: <UsersNotificationsPage /> },
  { path: 'roles', el: <RolesPage /> },
  { path: 'dominios', el: <DomainsPage /> },
  { path: 'redirecciones', el: <RedirectsPage /> },
  { path: 'medicion', el: <TrackingPage /> },
  { path: 'ficha-tecnica', el: <SpecFieldsPage /> },
];

/**
 * Todas las pantallas del panel, con el path completo. Lo usan los tests para
 * recorrerlas sin mantener una lista aparte que se desactualice.
 */
export const ALL_PATHS: readonly string[] = [
  ...MAIN_ROUTES.map((r) => r.path),
  ...SETTINGS_ROUTES.map((r) => `${SETTINGS_BASE}/${r.path}`),
  '/ayuda',
];

const renderRoute = (base: string) => (r: AppRoute) => {
  const perm = routePerm(`${base}${r.path}`);
  // Cada pantalla, con su esqueleto mientras se baja y su barrera de errores.
  return (
    <Route
      key={r.path}
      path={r.path}
      element={<ScreenBoundary>{perm ? <RequirePerm perm={perm}>{r.el}</RequirePerm> : r.el}</ScreenBoundary>}
    />
  );
};

/** /configuracion lleva a la primera pantalla que la persona puede ver. */
function SettingsIndex() {
  const { can, loading } = usePermissions();
  if (loading) return null;
  const first = firstSettingsPath(can);
  return <Navigate to={first ? `${SETTINGS_BASE}/${first}` : '/'} replace />;
}

export default function App() {
  return (
    <>
      {/* Ctrl/Cmd+K en cualquier pantalla del admin. */}
      <CommandPalette />
      <Routes>
        <Route element={<AdminLayout />}>{MAIN_ROUTES.map(renderRoute(''))}</Route>

        {/* Configuración: layout propio con su nav lateral */}
        <Route path={SETTINGS_BASE} element={<SettingsLayout />}>
          <Route index element={<SettingsIndex />} />
          {SETTINGS_ROUTES.map(renderRoute(`${SETTINGS_BASE}/`))}
        </Route>

        {/* Centro de ayuda (standalone, sin sidebar — se abre en pestaña nueva). */}
        <Route
          path="/ayuda"
          element={
            <ScreenBoundary>
              <HelpIndexPage />
            </ScreenBoundary>
          }
        />
        <Route
          path="/ayuda/:topic"
          element={
            <ScreenBoundary>
              <HelpArticlePage />
            </ScreenBoundary>
          }
        />

        <Route element={<AdminLayout />}>
          <Route
            path="*"
            element={
              <ScreenBoundary>
                <NotFoundPage />
              </ScreenBoundary>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
