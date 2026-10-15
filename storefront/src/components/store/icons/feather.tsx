// Feather (outline fino). Un módulo por kit: Icon.tsx carga solo el de la tienda.
import type { ComponentType } from 'react';
import {
  ShoppingCart as FeCart,
  Heart as FeHeart,
  User as FeUser,
  Search as FeSearch,
  Menu as FeMenu,
  X as FeX,
  ChevronDown as FeChevronDown,
  ChevronLeft as FeChevronLeft,
  ChevronRight as FeChevronRight,
  Truck as FeTruck,
  CreditCard as FeCard,
  Shield as FeShield,
  Gift as FeGift,
  Headphones as FeSupport,
  RefreshCw as FeReturns,
  MapPin as FeMapPin,
  Phone as FePhone,
  Mail as FeMail,
  MessageCircle as FeChat,
} from 'react-feather';
import { Quote as LuQuote } from 'lucide-react';
import type { IconName } from '../Icon';

// Cada librería tipa sus íconos distinto; acá solo se les pasa className.
const ICONS: Record<IconName, ComponentType<any>> = {
  cart: FeCart,
  heart: FeHeart,
  user: FeUser,
  search: FeSearch,
  menu: FeMenu,
  close: FeX,
  chevronDown: FeChevronDown,
  chevronLeft: FeChevronLeft,
  chevronRight: FeChevronRight,
  shipping: FeTruck,
  card: FeCard,
  security: FeShield,
  gift: FeGift,
  support: FeSupport,
  returns: FeReturns,
  mapPin: FeMapPin,
  phone: FePhone,
  mail: FeMail,
  chat: FeChat,
  // Lo que el kit no tiene, de lucide (como antes).
  quote: LuQuote,
};

export default function KitIcon({ name, className }: { name: IconName; className?: string }) {
  const Cmp = ICONS[name];
  return Cmp ? <Cmp className={className} aria-hidden /> : null;
}
