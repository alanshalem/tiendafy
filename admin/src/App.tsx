import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { SettingsLayout } from './pages/Settings/SettingsLayout';
import { PaymentMethodsPage } from './pages/Settings/PaymentMethods';
import { ShippingMethodsPage } from './pages/Settings/ShippingMethods';
import { ContactInfoPage } from './pages/Settings/ContactInfo';
import { WhatsAppButtonPage } from './pages/Settings/WhatsAppButton';
import { CustomerMessagePage } from './pages/Settings/CustomerMessage';
import { AutoEmailsPage } from './pages/Settings/AutoEmails';
import { CheckoutOptionsPage } from './pages/Settings/CheckoutOptions';
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
import { PagesPage } from './pages/Pages';
import { ThemeEditorPage } from './pages/ThemeEditor';
import { ThemeGalleryPage } from './pages/ThemeGallery';
import { TenantsPage } from './pages/Tenants';
import { StatsOverviewPage } from './pages/Stats/Overview';
import { StatsProductsPage } from './pages/Stats/Products';
import { StatsSalesPage } from './pages/Stats/SalesCustomers';
import { StatsVisitsPage } from './pages/Stats/Visits';
import { StatsRealTimePage } from './pages/Stats/RealTime';
import { StatsCouponsPage } from './pages/Stats/Coupons';
import { StubPage, stubs } from './pages/Stub';

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* Estadísticas */}
        <Route path="/estadisticas" element={<StatsOverviewPage />} />
        <Route path="/estadisticas/productos" element={<StatsProductsPage />} />
        <Route path="/estadisticas/ventas" element={<StatsSalesPage />} />
        <Route path="/estadisticas/visitas" element={<StatsVisitsPage />} />
        <Route path="/estadisticas/tiempo-real" element={<StatsRealTimePage />} />
        <Route path="/estadisticas/cupones" element={<StatsCouponsPage />} />

        {/* Productos */}
        <Route path="/productos" element={<ProductsPage />} />
        <Route path="/productos/nuevo" element={<NewProductPage />} />
        <Route path="/productos/:id/editar" element={<EditProductPage />} />
        <Route path="/productos/exportar-importar" element={<ExportImportPage />} />
        <Route path="/productos/categorias" element={<CategoriesPage />} />
        <Route path="/productos/inventario" element={<InventoryPage />} />

        {/* Tienda online */}
        <Route path="/canales/tienda-online" element={<ThemeEditorPage />} />
        <Route path="/canales/tienda-online/disenios" element={<ThemeGalleryPage />} />

        <Route path="/descuentos" element={<DiscountsPage />} />
        <Route path="/clientes" element={<CustomersPage />} />
        <Route path="/paginas" element={<PagesPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        {Object.keys(stubs).map((id) => (
          <Route key={id} path={`/${id}`} element={<StubPage id={id} />} />
        ))}
      </Route>

      {/* Configuración: layout propio con su nav lateral (como Tiendanube) */}
      <Route path="/configuracion" element={<SettingsLayout />}>
        <Route index element={<Navigate to="/configuracion/medios-de-pago" replace />} />
        <Route path="medios-de-pago" element={<PaymentMethodsPage />} />
        <Route path="medios-de-envio" element={<ShippingMethodsPage />} />
        <Route path="centros-de-distribucion" element={<DistributionCentersPage />} />
        <Route path="informacion-de-contacto" element={<ContactInfoPage />} />
        <Route path="boton-de-whatsapp" element={<WhatsAppButtonPage />} />
        <Route path="emails-automaticos" element={<AutoEmailsPage />} />
        <Route path="opciones-del-checkout" element={<CheckoutOptionsPage />} />
        <Route path="mensaje-para-clientes" element={<CustomerMessagePage />} />
        <Route path="usuarios" element={<UsersNotificationsPage />} />
        <Route path="dominios" element={<DomainsPage />} />
        <Route path="codigos-externos" element={<ExternalCodesPage />} />
        <Route path="idiomas-y-monedas" element={<LanguagesCurrenciesPage />} />
        <Route path="redirecciones" element={<RedirectsPage />} />
        <Route path="campos-personalizados" element={<CustomFieldsPage />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route path="*" element={<StubPage id="aplicaciones" />} />
      </Route>
    </Routes>
  );
}
