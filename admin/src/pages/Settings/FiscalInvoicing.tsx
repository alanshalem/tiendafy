import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import {
  CertificateStep,
  EmissionStep,
  IntroBanner,
  IssuerStep,
  PointsOfSaleStep,
  ProgressChecklist,
  type FiscalConfigDto,
  type PointOfSale,
} from './fiscal-invoicing-steps';

// ---- Página ------------------------------------------------------------------

export function FiscalInvoicingPage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const canConfig = can('fiscal.config');
  const { toast } = useToast();

  const [config, setConfig] = useState<FiscalConfigDto | null>(null);
  const [points, setPoints] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, pos] = await Promise.all([
        api.get<FiscalConfigDto>('/api/v1/fiscal/config'),
        api.get<{ items: PointOfSale[] }>('/api/v1/fiscal/points-of-sale').catch(() => ({ items: [] })),
      ]);
      setConfig(cfg);
      setPoints(pos.items ?? []);
    } catch (err) {
      toast(errMsg(err, 'No se pudo cargar la configuración de facturación.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (store && canConfig) load();
    else if (!canConfig) setLoading(false);
  }, [store, canConfig, load]);

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader
        title="Facturación electrónica (ARCA)"
        description="Conectá tu tienda con ARCA para emitir facturas oficiales de tus ventas."
      />

      {!canConfig ? (
        <NoPermission />
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-6 text-sm text-fg-muted shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
        </div>
      ) : (
        <div className="space-y-5">
          <IntroBanner />
          <ProgressChecklist config={config} points={points} />
          <IssuerStep config={config} onSaved={load} />
          <CertificateStep config={config} onChanged={load} />
          <PointsOfSaleStep points={points} configured={!!config?.configured} onChanged={load} />
          <EmissionStep config={config} points={points} onSaved={load} />
        </div>
      )}
      <HelpLink id="fiscal" />
    </div>
  );
}

// ---- Sin permiso -------------------------------------------------------------

function NoPermission() {
  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-card">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-muted text-fg-muted">
        <Lock className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-fg">No tenés permiso para la facturación</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
        La configuración fiscal solo la pueden tocar los roles Dueño, Administrador o Finanzas. Si necesitás
        acceso, pedile a un administrador de la tienda que ajuste tu rol.
      </p>
    </div>
  );
}
