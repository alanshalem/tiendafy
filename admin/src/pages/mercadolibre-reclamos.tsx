import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@tiendafy/ui';
import { api } from '../lib/api';
import { Cargando, Vacio, fecha } from './mercadolibre-shared';

interface MeliClaim {
  id: string;
  status: string | null;
  stage: string | null;
  reasonId: string | null;
  resourceId: string;
  dateCreated: string | null;
}

// ---- Reclamos ----------------------------------------------------------------

export function ReclamosTab() {
  const [claims, setClaims] = useState<MeliClaim[] | null>(null);

  useEffect(() => {
    api
      .get<{ claims: MeliClaim[] }>('/api/v1/admin/meli/claims')
      .then((r) => setClaims(r.claims))
      .catch(() => setClaims([]));
  }, []);

  return claims === null ? (
    <Cargando />
  ) : claims.length === 0 ? (
    <Vacio texto="Sin reclamos abiertos en Mercado Libre. 🎉" />
  ) : (
    <div className="space-y-3">
      {claims.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-fg">Reclamo #{c.id}</span>
              <Badge variant="warning">{c.status ?? '—'}</Badge>
              {c.stage && <Badge variant="neutral">{c.stage}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-fg-muted">
              {c.reasonId ? `Motivo: ${c.reasonId} · ` : ''}Venta {c.resourceId} · {fecha(c.dateCreated)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
