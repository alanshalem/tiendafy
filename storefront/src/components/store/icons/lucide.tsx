// Lucide (default / outline). Un módulo por kit: Icon.tsx carga solo el de la tienda.
import type { ComponentType } from 'react';
import {
  ShoppingCart as LuCart,
  Heart as LuHeart,
  User as LuUser,
  Search as LuSearch,
  Menu as LuMenu,
  X as LuX,
  ChevronDown as LuChevronDown,
  ChevronLeft as LuChevronLeft,
  ChevronRight as LuChevronRight,
  Truck as LuTruck,
  CreditCard as LuCard,
  ShieldCheck as LuShield,
  Gift as LuGift,
  Headphones as LuSupport,
  RefreshCw as LuReturns,
  MapPin as LuMapPin,
  Phone as LuPhone,
  Mail as LuMail,
  MessageCircle as LuChat,
  Quote as LuQuote,
} from 'lucide-react';
import type { IconName } from '../Icon';

// Cada librería tipa sus íconos distinto; acá solo se les pasa className.
const ICONS: Record<IconName, ComponentType<any>> = {
  cart: LuCart,
  heart: LuHeart,
  user: LuUser,
  search: LuSearch,
  menu: LuMenu,
  close: LuX,
  chevronDown: LuChevronDown,
  chevronLeft: LuChevronLeft,
  chevronRight: LuChevronRight,
  shipping: LuTruck,
  card: LuCard,
  security: LuShield,
  gift: LuGift,
  support: LuSupport,
  returns: LuReturns,
  mapPin: LuMapPin,
  phone: LuPhone,
  mail: LuMail,
  chat: LuChat,
  quote: LuQuote, // solo lucide: los demás kits caen acá (fallback del registro)
};

export default function KitIcon({ name, className }: { name: IconName; className?: string }) {
  const Cmp = ICONS[name];
  return Cmp ? <Cmp className={className} aria-hidden /> : null;
}
