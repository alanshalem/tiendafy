// Heroicons (sólido). Un módulo por kit: Icon.tsx carga solo el de la tienda.
import type { ComponentType } from 'react';
import {
  ShoppingCartIcon as HeCart,
  HeartIcon as HeHeart,
  UserIcon as HeUser,
  MagnifyingGlassIcon as HeSearch,
  Bars3Icon as HeMenu,
  XMarkIcon as HeX,
  ChevronDownIcon as HeChevronDown,
  ChevronLeftIcon as HeChevronLeft,
  ChevronRightIcon as HeChevronRight,
  TruckIcon as HeTruck,
  CreditCardIcon as HeCard,
  ShieldCheckIcon as HeShield,
  GiftIcon as HeGift,
  ArrowPathIcon as HeReturns,
  MapPinIcon as HeMapPin,
  PhoneIcon as HePhone,
  EnvelopeIcon as HeMail,
  ChatBubbleOvalLeftIcon as HeChat,
} from '@heroicons/react/24/solid';
import { Headphones as LuSupport, Quote as LuQuote } from 'lucide-react';
import type { IconName } from '../Icon';

// Cada librería tipa sus íconos distinto; acá solo se les pasa className.
const ICONS: Record<IconName, ComponentType<any>> = {
  cart: HeCart,
  heart: HeHeart,
  user: HeUser,
  search: HeSearch,
  menu: HeMenu,
  close: HeX,
  chevronDown: HeChevronDown,
  chevronLeft: HeChevronLeft,
  chevronRight: HeChevronRight,
  shipping: HeTruck,
  card: HeCard,
  security: HeShield,
  gift: HeGift,
  returns: HeReturns,
  mapPin: HeMapPin,
  phone: HePhone,
  mail: HeMail,
  chat: HeChat,
  // Lo que el kit no tiene, de lucide (como antes).
  support: LuSupport,
  quote: LuQuote,
};

export default function KitIcon({ name, className }: { name: IconName; className?: string }) {
  const Cmp = ICONS[name];
  return Cmp ? <Cmp className={className} aria-hidden /> : null;
}
