import { lazy, Suspense } from 'react';
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
import { ExportImportPage } from './pages/Products/ExportImport';
import { NewProductPage } from './pages/Products/NewProduct';
import { EditProductPage } from './pages/Products/EditProduct';
import { DiscountsPage } from './pages/Discounts';
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
import { StatsVisitsPage } from './pages/Stats/Visits';
import { StatsRealTimePage } from './pages/Stats/RealTime';
import { StatsCouponsPage } from './pages/Stats/Coupons';
import { StubPage, stubs } from './pages/Stub';
import { RequirePerm } from './context/PermissionsContext';

export default function App() {
  return (
    <>
    {/* Ctrl/Cmd+K en cualquier pantalla del admin. */}
    <CommandPalette />
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* Estadísticas */}
        <Route path="/estadisticas" element={<RequirePerm perm="stats.read"><StatsOverviewPage /></RequirePerm>} />
        <Route path="/estadisticas/productos" element={<RequirePerm perm="stats.read"><StatsProductsPage /></RequirePerm>} />
        <Route path="/estadisticas/ventas" element={<RequirePerm perm="stats.read"><StatsSalesPage /></RequirePerm>} />
        <Route path="/estadisticas/visitas" element={<RequirePerm perm="stats.read"><StatsVisitsPage /></RequirePerm>} />
        <Route path="/estadisticas/tiempo-real" element={<RequirePerm perm="stats.read"><StatsRealTimePage /></RequirePerm>} />
        <Route path="/estadisticas/cupones" element={<RequirePerm perm="stats.read"><StatsCouponsPage /></RequirePerm>} />

        {/* Productos */}
        <Route path="/productos" element={<RequirePerm perm={['inventory.read', 'catalog.write']}><ProductsPage /></RequirePerm>} />
        <Route path="/productos/nuevo" element={<RequirePerm perm="catalog.write"><NewProductPage /></RequirePerm>} />
        <Route path="/productos/:id/editar" element={<RequirePerm perm="catalog.write"><EditProductPage /></RequirePerm>} />
        <Route path="/productos/exportar-importar" element={<RequirePerm perm="catalog.write"><ExportImportPage /></RequirePerm>} />
        <Route path="/productos/categorias" element={<RequirePerm perm="catalog.write"><CategoriesPage /></RequirePerm>} />
        <Route path="/productos/inventario" element={<RequirePerm perm="inventory.read"><InventoryPage /></RequirePerm>} />

        {/* Tienda online */}
        <Route
          path="/canales/tienda-online"
          element={
            <RequirePerm perm="content.write">
              <Suspense fallback={<p className="py-16 text-center text-sm text-fg-muted">Cargando editor...</p>}>
                <ThemeEditorPage />
              </Suspense>
            </RequirePerm>
          }
        />
        <Route
          path="/canales/tienda-online/disenios"
          element={
            <RequirePerm perm="content.write">
              <Suspense fallback={<p className="py-16 text-center text-sm text-fg-muted">Cargando...</p>}>
                <ThemeGalleryPage />
              </Suspense>
            </RequirePerm>
          }
        />

        {/* Ventas */}
        <Route path="/ventas" element={<RequirePerm perm="orders.read"><OrdersPage /></RequirePerm>} />
        <Route path="/ventas/carritos" element={<RequirePerm perm="orders.read"><AbandonedCartsPage /></RequirePerm>} />

        <Route path="/descuentos" element={<RequirePerm perm="discounts.read"><DiscountsPage /></RequirePerm>} />
        <Route path="/clientes" element={<RequirePerm perm="customers.read"><CustomersPage /></RequirePerm>} />
        <Route path="/mensajes" element={<RequirePerm perm="messages.read"><MessagesPage /></RequirePerm>} />
        <Route path="/posventa" element={<RequirePerm perm="support.chat"><SupportChatPage /></RequirePerm>} />
        <Route path="/paginas" element={<RequirePerm perm="content.write"><PagesPage /></RequirePerm>} />
        <Route path="/tenants" element={<TenantsPage />} />
        {Object.keys(stubs).map((id) => (
          <Route key={id} path={`/${id}`} element={<StubPage id={id} />} />
        ))}
      </Route>

      {/* Configuración: layout propio con su nav lateral */}
      <Route path="/configuracion" element={<SettingsLayout />}>
        <Route index element={<Navigate to="/configuracion/medios-de-pago" replace />} />
        <Route path="medios-de-pago" element={<RequirePerm perm="payments.read"><PaymentMethodsPage /></RequirePerm>} />
        <Route path="medios-de-envio" element={<RequirePerm perm="settings.write"><ShippingMethodsPage /></RequirePerm>} />
        <Route path="centros-de-distribucion" element={<RequirePerm perm="settings.write"><DistributionCentersPage /></RequirePerm>} />
        <Route path="emails-automaticos" element={<RequirePerm perm="settings.write"><AutoEmailsPage /></RequirePerm>} />
        <Route path="whatsapp-automatico" element={<RequirePerm perm="settings.write"><WhatsAppAutoPage /></RequirePerm>} />
        <Route path="opciones-del-checkout" element={<RequirePerm perm="settings.write"><CheckoutOptionsPage /></RequirePerm>} />
        <Route path="facturacion" element={<RequirePerm perm="fiscal.config"><FiscalInvoicingPage /></RequirePerm>} />
        <Route path="usuarios" element={<RequirePerm perm="members.read"><UsersNotificationsPage /></RequirePerm>} />
        <Route path="dominios" element={<RequirePerm perm="settings.write"><DomainsPage /></RequirePerm>} />
        <Route path="codigos-externos" element={<RequirePerm perm="settings.write"><ExternalCodesPage /></RequirePerm>} />
        <Route path="idiomas-y-monedas" element={<RequirePerm perm="settings.write"><LanguagesCurrenciesPage /></RequirePerm>} />
        <Route path="redirecciones" element={<RequirePerm perm="settings.write"><RedirectsPage /></RequirePerm>} />
        <Route path="campos-personalizados" element={<RequirePerm perm="settings.write"><CustomFieldsPage /></RequirePerm>} />
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
