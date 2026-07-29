'use client';

import { createContext, useContext, type ComponentType } from 'react';
import type { IconKit } from '@/lib/theme';

// Lucide (default / outline)
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
// Phosphor (renderizado con weight="fill" → sólido redondeado)
import {
  ShoppingCart as PhCart,
  Heart as PhHeart,
  User as PhUser,
  MagnifyingGlass as PhSearch,
  List as PhMenu,
  X as PhX,
  CaretDown as PhChevronDown,
  CaretLeft as PhChevronLeft,
  CaretRight as PhChevronRight,
  Truck as PhTruck,
  CreditCard as PhCard,
  ShieldCheck as PhShield,
  Gift as PhGift,
  Headphones as PhSupport,
  ArrowsClockwise as PhReturns,
  MapPin as PhMapPin,
  Phone as PhPhone,
  EnvelopeSimple as PhMail,
  ChatCircle as PhChat,
} from '@phosphor-icons/react';
// Tabler (outline, geometría propia)
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
// Heroicons (sólido)
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
// Feather (outline fino)
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

// Cada librería tipa sus íconos distinto (props de stroke/weight/etc.); usamos
// una firma laxa porque sólo les pasamos className y (para phosphor) weight.

type IconCmp = ComponentType<any>;

// Cada kit mapea los nombres semánticos a su componente. Lo que falte cae a lucide.
const KITS: Record<IconKit, Partial<Record<IconName, IconCmp>>> = {
  lucide: {
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
  },
  phosphor: {
    cart: PhCart,
    heart: PhHeart,
    user: PhUser,
    search: PhSearch,
    menu: PhMenu,
    close: PhX,
    chevronDown: PhChevronDown,
    chevronLeft: PhChevronLeft,
    chevronRight: PhChevronRight,
    shipping: PhTruck,
    card: PhCard,
    security: PhShield,
    gift: PhGift,
    support: PhSupport,
    returns: PhReturns,
    mapPin: PhMapPin,
    phone: PhPhone,
    mail: PhMail,
    chat: PhChat,
  },
  tabler: {
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
  },
  heroicons: {
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
    // support (headphones) no existe en heroicons → cae a lucide.
  },
  feather: {
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
  },
};

// El kit activo del storefront. StorefrontView lo provee desde theme.iconKit.
export const IconKitContext = createContext<IconKit>('lucide');

/**
 * Ícono semántico del storefront. El estilo sale del kit activo (contexto).
 * `name` es agnóstico del kit; si un kit no tiene ese ícono, cae a lucide.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const kit = useContext(IconKitContext);
  const Cmp = KITS[kit]?.[name] ?? KITS.lucide[name];
  if (!Cmp) return null;
  // Phosphor usa weight para el estilo sólido; el resto ignora la prop.
  const weight = kit === 'phosphor' ? 'fill' : undefined;
  return <Cmp className={className} weight={weight} aria-hidden />;
}
