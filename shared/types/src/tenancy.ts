import type { IsoDateTime, TenantId } from './common';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELED';
export type PlanTier = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';

export interface Tenant {
  id: TenantId;
  name: string;
  /** Subdominio: "mitienda" → mitienda.plataforma.com. */
  subdomain: string;
  /** Dominio custom verificado, si tiene. */
  customDomain: string | null;
  status: TenantStatus;
  plan: PlanTier;
  createdAtUtc: IsoDateTime;
}

/**
 * Tokens de tema del merchant — override de las CSS vars de
 * @tiendafy/design-system (tokens.css). El storefront los inyecta en :root.
 */
export interface ThemeTokens {
  /** "79 70 229" — canal RGB crudo, mismo formato que tokens.css. */
  colorPrimary?: string;
  colorPrimaryHover?: string;
  colorAccent?: string;
  colorBg?: string;
  colorFg?: string;
  fontSans?: string;
  fontHeading?: string;
  radiusMd?: string;
}

export type SectionType =
  'hero' | 'featured-products' | 'collection-grid' | 'newsletter' | 'rich-text' | 'image-banner';

/** Sección componible del builder de temas. */
export interface ThemeSection {
  id: string;
  type: SectionType;
  /** Settings específicos del tipo de sección (validados por schema en backend). */
  settings: Record<string, unknown>;
  position: number;
}

export interface Theme {
  id: string;
  name: string;
  published: boolean;
  tokens: ThemeTokens;
  sections: ThemeSection[];
  updatedAt: IsoDateTime;
}
