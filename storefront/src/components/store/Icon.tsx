'use client';

import { createContext, useContext, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import type { IconKit } from '@/lib/theme';

export type IconName =
  | 'cart'
  | 'heart'
  | 'user'
  | 'search'
  | 'menu'
  | 'close'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'shipping'
  | 'card'
  | 'security'
  | 'gift'
  | 'support'
  | 'returns'
  | 'mapPin'
  | 'phone'
  | 'mail'
  | 'chat'
  | 'quote';

type KitIconProps = { name: IconName; className?: string };

/*
 * Un módulo por kit (./icons/<kit>.tsx), cargado cuando se usa. Antes este
 * archivo importaba los íconos de los cinco kits y toda tienda bajaba los
 * cinco, aunque cada una usa uno solo.
 *
 * Con `loading` cada ícono tiene su propio Suspense: mientras llega el kit
 * (solo en la primera carga) se ve el HTML del servidor, y un ícono que se
 * dibuja recién en el navegador queda vacío un instante, en vez de suspender
 * la página entera hasta el Suspense más cercano. El servidor pide el módulo
 * por adelantado (preload), así que llega junto con el resto.
 */
const empty = () => null;
const KITS: Record<IconKit, ComponentType<KitIconProps>> = {
  lucide: dynamic(() => import('./icons/lucide'), { loading: empty }),
  phosphor: dynamic(() => import('./icons/phosphor'), { loading: empty }),
  tabler: dynamic(() => import('./icons/tabler'), { loading: empty }),
  heroicons: dynamic(() => import('./icons/heroicons'), { loading: empty }),
  feather: dynamic(() => import('./icons/feather'), { loading: empty }),
};

// El kit activo del storefront. StorefrontView lo provee desde theme.iconKit.
export const IconKitContext = createContext<IconKit>('lucide');

/**
 * Ícono semántico del storefront. El estilo sale del kit activo (contexto).
 * `name` es agnóstico del kit; si un kit no tiene ese ícono, cae a lucide.
 */
export function Icon({ name, className }: KitIconProps) {
  const kit = useContext(IconKitContext);
  const KitIcon = KITS[kit] ?? KITS.lucide;
  return <KitIcon name={name} className={className} />;
}
