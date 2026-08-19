import type { IsoDateTime, TenantId } from './common';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELED';

export interface Tenant {
  id: TenantId;
  name: string;
  /** Subdominio: "mitienda" → mitienda.plataforma.com. */
  subdomain: string;
  /** Dominio custom verificado, si tiene. */
  customDomain: string | null;
  status: TenantStatus;
  createdAtUtc: IsoDateTime;
}

// El modelo del tema (tokens, secciones) vive en theme.ts, que es el que
// exporta el barrel y usan admin y storefront. Acá había una copia MUERTA con
// los mismos nombres y otra forma (`settings`/`position` en vez de
// `data`/`visible`): un import por autocompletado compilaba y fallaba en runtime.
