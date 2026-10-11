/**
 * Un componente de la tienda con lo que le pone StorefrontView alrededor:
 * sesión del comprador, favoritos y carrito de la tienda sembrada.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider } from '../components/store/auth';
import { CartProvider } from '../components/store/cart';
import { FavoritesProvider } from '../components/store/favorites';
import { fixtureTenantId } from './api';

export function StoreProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider storeKey={fixtureTenantId}>
      <FavoritesProvider storeKey={fixtureTenantId}>
        <CartProvider storeKey={fixtureTenantId}>{children}</CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}

export const renderInStore = (ui: ReactNode) => render(ui, { wrapper: StoreProviders });
