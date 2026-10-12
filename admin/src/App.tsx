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
import { RedirectsPage } from './pages/Settings/Redirects';
import { TrackingPage } from './pages/Settings/Tracking';
import { SpecFieldsPage } from './pages/Settings/SpecFields';
import { FiscalInvoicingPage } from './pages/Settings/FiscalInvoicing';
import { DomainsPage } from './pages/Settings/Domains';
import { UsersNotificationsPage } from './pages/Settings/UsersNotifications';
import { RolesPage } from './pages/Settings/Roles';
import { HomePage } from './pages/Home';
import { ProductsPage } from './pages/Products';
import { CategoriesPage } from './pages/Products/Categories';
import { InventoryPage } from './pages/Products/Inventory';
import { CostsPage } from './pages/Products/Costs';
import { PriceListsPage } from './pages/Products/PriceLists';
import { ComprasPage } from './pages/Compras';
import { ProveedoresPage } from './pages/Proveedores';
import { TesoreriaPage } from './pages/Tesoreria';
import { CuentasCorrientesPage } from './pages/CuentasCorrientes';
import { ScannerPage } from './pages/Products/Scanner';
import { KitsPage } from './pages/Products/Kits';
import { ExportImportPage } from './pages/Products/ExportImport';
import { NewProductPage } from './pages/Products/NewProduct';
import { EditProductPage } from './pages/Products/EditProduct';
import { DiscountsPage } from './pages/Discounts';
import { MarketingPage } from './pages/Marketing';
import { MercadoLibrePage } from './pages/MercadoLibre';
import { RedesPage } from './pages/Redes';
import { MeliSettingsPage } from './pages/Settings/MercadoLibre';
import { CustomersPage } from './pages/Customers';
import { MessagesPage } from './pages/Messages';
import { SupportChatPage } from './pages/SupportChat';
import { OrdersPage } from './pages/Orders';
import { AbandonedCartsPage } from './pages/AbandonedCarts';
import { PresupuestosPage } from './pages/Presupuestos';
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
import { NotFoundPage } from './pages/NotFound';
import { RequirePerm, usePermissions } from './context/PermissionsContext';
import { firstSettingsPath, routePerm, SETTINGS_BASE } from './lib/access';

/**
 * Tabla de rutas: path + pantalla. El permiso de cada una sale de
 * lib/access (la misma tabla que usan los menús), y el <RequirePerm> se arma al render.
 */
interface AppRoute {
  path: string;
  el: ReactNode;
}

const lazyFallback = (label: string) => <p className="py-16 text-center text-sm text-fg-muted">{label}</p>;

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

  // Tienda online (chunks lazy)
  {
    path: '/canales/tienda-online',
    el: (
      <Suspense fallback={lazyFallback('Cargando editor...')}>
        <ThemeEditorPage />
      </Suspense>
    ),
  },
  {
    path: '/canales/tienda-online/disenios',
    el: (
      <Suspense fallback={lazyFallback('Cargando...')}>
        <ThemeGalleryPage />
      </Suspense>
    ),
  },

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
  return (
    <Route key={r.path} path={r.path} element={perm ? <RequirePerm perm={perm}>{r.el}</RequirePerm> : r.el} />
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
        <Route path="/ayuda" element={<HelpIndexPage />} />
        <Route path="/ayuda/:topic" element={<HelpArticlePage />} />

        <Route element={<AdminLayout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
