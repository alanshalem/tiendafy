'use client';

import { createContext, useContext } from 'react';
import type { StoreOffers } from '@/lib/store-offers';

/**
 * Las ofertas de la tienda (ver lib/store-offers) para lo que necesita más que
 * el número que ya viaja en el tema: las condiciones de las cuotas, si el
 * efectivo existe, si se puede pagar online. Lo provee StorefrontView.
 */
export const StoreOffersContext = createContext<StoreOffers | null>(null);

export const useStoreOffers = () => useContext(StoreOffersContext);
