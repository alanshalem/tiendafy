// Tabler (outline, geometría propia). Un módulo por kit: Icon.tsx carga solo el de la tienda.
import type { ComponentType } from 'react';
import {
  IconShoppingCart as TbCart,
  IconHeart as TbHeart,
  IconUser as TbUser,
  IconSearch as TbSearch,
  IconMenu2 as TbMenu,
  IconX as TbX,
  IconChevronDown as TbChevronDown,
  IconChevronLeft as TbChevronLeft,
  IconChevronRight as TbChevronRight,
  IconTruck as TbTruck,
  IconCreditCard as TbCard,
  IconShieldCheck as TbShield,
  IconGift as TbGift,
  IconHeadphones as TbSupport,
  IconRefresh as TbReturns,
  IconMapPin as TbMapPin,
  IconPhone as TbPhone,
  IconMail as TbMail,
  IconMessageCircle as TbChat,
} from '@tabler/icons-react';
import { Quote as LuQuote } from 'lucide-react';
import type { IconName } from '../Icon';

// Cada librería tipa sus íconos distinto; acá solo se les pasa className.
const ICONS: Record<IconName, ComponentType<any>> = {
  cart: TbCart,
  heart: TbHeart,
  user: TbUser,
  search: TbSearch,
  menu: TbMenu,
  close: TbX,
  chevronDown: TbChevronDown,
  chevronLeft: TbChevronLeft,
  chevronRight: TbChevronRight,
  shipping: TbTruck,
  card: TbCard,
  security: TbShield,
  gift: TbGift,
  support: TbSupport,
  returns: TbReturns,
  mapPin: TbMapPin,
  phone: TbPhone,
  mail: TbMail,
  chat: TbChat,
  // Lo que el kit no tiene, de lucide (como antes).
  quote: LuQuote,
};

export default function KitIcon({ name, className }: { name: IconName; className?: string }) {
  const Cmp = ICONS[name];
  return Cmp ? <Cmp className={className} aria-hidden /> : null;
}
