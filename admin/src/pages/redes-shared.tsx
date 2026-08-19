import type { ComponentType } from 'react';
import type { BadgeVariant } from '@tiendafy/ui';

// ---- Tipos wire --------------------------------------------------------------

export interface SocialConnectorDto {
  key: string;
  displayName: string;
  configured: boolean;
}

export interface SocialChannelDto {
  key: string;
  displayName: string;
  limits: { maxChars: number; maxImages: number; requiresMedia: boolean };
}

export interface SocialChannelsDto {
  connectors: SocialConnectorDto[];
  channels: SocialChannelDto[];
}

export interface SocialAccountDto {
  id: string;
  provider: string;
  providerId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  authorized: boolean;
  connectedAtUtc: string;
}

export interface SocialTargetDto {
  accountId: string;
  provider: string | null;
  accountName: string;
  contentOverride: string | null;
  providerPostId: string | null;
  externalUrl: string | null;
  error: string | null;
  publishedAtUtc: string | null;
}

export interface SocialPostDto {
  id: string;
  content: string;
  mediaUrls: string[];
  status: 'Draft' | 'Scheduled' | 'Published' | 'Failed';
  scheduleStatus: 'Pending' | 'Processing' | 'Processed';
  scheduledAtUtc: string | null;
  publishedAtUtc: string | null;
  createdAtUtc: string;
  isEditable: boolean;
  couponCode: string | null;
  attributedOrders: number;
  attributedRevenueMinor: number;
  targets: SocialTargetDto[];
}

// ---- Presentación por red ----------------------------------------------------
// lucide ya no trae iconos de marca: SVGs propios con la misma API (className).

type IconProps = { className?: string };

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function FacebookIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function InstagramIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function XBrandIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

function TelegramIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

const PROVIDER_META: Record<string, { label: string; icon: ComponentType<IconProps>; className: string }> = {
  meta_facebook: { label: 'Facebook', icon: FacebookIcon, className: 'bg-[#1877f2] text-white' },
  meta_instagram: {
    label: 'Instagram',
    icon: InstagramIcon,
    className: 'bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white',
  },
  x: { label: 'X (Twitter)', icon: XBrandIcon, className: 'bg-black text-white' },
  telegram: { label: 'Telegram', icon: TelegramIcon, className: 'bg-[#229ed9] text-white' },
};

export function providerMeta(provider: string | null) {
  return (
    PROVIDER_META[provider ?? ''] ?? {
      label: provider ?? '—',
      icon: TelegramIcon,
      className: 'bg-bg-muted text-fg-subtle',
    }
  );
}

export function ProviderIcon({ provider, size = 'md' }: { provider: string | null; size?: 'sm' | 'md' }) {
  const meta = providerMeta(provider);
  const Icon = meta.icon;
  const box = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  const glyph = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5';
  return (
    <span
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full ${meta.className}`}
      title={meta.label}
    >
      <Icon className={glyph} />
    </span>
  );
}

/** Estado del post: label, badge y color de punto (calendario) en UN mapa. */
export const POST_STATUS: Record<string, { label: string; variant: BadgeVariant; dot: string }> = {
  Draft: { label: 'Borrador', variant: 'neutral', dot: 'bg-fg-subtle' },
  Scheduled: { label: 'Programado', variant: 'info', dot: 'bg-info' },
  Published: { label: 'Publicado', variant: 'success', dot: 'bg-success' },
  Failed: { label: 'Con errores', variant: 'danger', dot: 'bg-danger' },
};

/** Conector OAuth → red representativa (icono) y blurb del panel de cuentas. */
export const CONNECTOR_META: Record<string, { provider: string; blurb: string }> = {
  meta: { provider: 'meta_facebook', blurb: 'Páginas de Facebook y sus cuentas de Instagram Business.' },
  x: { provider: 'x', blurb: 'Tu cuenta de X para publicar posts de texto.' },
  telegram: { provider: 'telegram', blurb: 'Un canal o grupo, publicando con tu propio bot.' },
};

/** Red → conector que la reconecta (meta_facebook y meta_instagram → meta). */
export const connectorFor = (provider: string): string => (provider.startsWith('meta_') ? 'meta' : provider);

export function postStatus(post: SocialPostDto): { label: string; variant: BadgeVariant } {
  if (post.scheduleStatus === 'Processing') return { label: 'Publicando…', variant: 'info' };
  return POST_STATUS[post.status] ?? { label: post.status, variant: 'neutral' };
}

/** Fecha efectiva del post en el calendario: la programada, o la de creación. */
export function postDate(post: SocialPostDto): Date {
  return new Date(post.scheduledAtUtc ?? post.publishedAtUtc ?? post.createdAtUtc);
}

/** Date local → valor para <input type="datetime-local"> (sin zona). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> (hora local) → ISO UTC para la API. */
export function localInputToUtcIso(value: string): string {
  return new Date(value).toISOString();
}
