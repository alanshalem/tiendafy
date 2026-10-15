import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { Download } from 'lucide-react';
import { Button, Card, Checkbox, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, errMsg } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { formatNumber } from '../../lib/format';

export function ExportTab() {
  const { store } = useStore();
  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Solo para mostrar el contador (el export real recorre TODO en el backend).
  // Una fila alcanza: el modo página devuelve el total. Antes traía cien
  // productos enteros para contarlos, y pasados los cien mostraba "100+".
  const { data } = useQuery({
    queryKey: qk.productsExportCount(store?.id),
    queryFn: () => api.get<{ total: number }>('/api/v1/products?limit=1&offset=0'),
    enabled: !!store,
  });
  const count = data?.total ?? 0;
  const countLabel = formatNumber(count);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await api.download(`/api/v1/products/export?includeDescriptions=${includeDescriptions}`);
      downloadBlob(blob, `productos-${store?.subdomain ?? 'tienda'}.csv`);
      toast('Archivo exportado', { variant: 'success' });
    } catch (e) {
      toast(errMsg(e, 'No se pudo exportar'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="text-sm font-medium text-fg-muted">Productos a exportar</div>
      <div className="mt-1 text-3xl font-bold text-fg">{countLabel}</div>
      <p className="mt-1 text-xs text-fg-subtle">
        El archivo incluye todas tus variantes y las URLs de las imágenes de cada producto.
      </p>
      <div className="mt-4">
        <Checkbox
          label="Incluir descripciones"
          checked={includeDescriptions}
          onChange={(e) => setIncludeDescriptions(e.target.checked)}
        />
      </div>
      <Button className="mt-5" disabled={count === 0 || busy} onClick={download}>
        {busy ? (
          'Generando…'
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Exportar
          </span>
        )}
      </Button>
    </Card>
  );
}
