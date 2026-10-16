'use client';

import { useEffect, useState } from 'react';
import { clientJsonTenant } from './api-client';

/** Lo que la tienda muestra de sí misma por ley (ver StoreLegalEndpoints en la API). */
export interface StoreLegal {
  legalName: string | null;
  /** Con guiones: "30-71234567-1". */
  cuit: string | null;
  address: string | null;
  dataFiscalUrl: string | null;
  dataFiscalImageUrl: string | null;
  priceWithoutTaxes: {
    show: boolean;
    condition: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';
    /** Por cuánto se divide el precio final (1 = el precio ya es el neto). */
    divisor: number;
  };
}

/**
 * Una sola consulta por tienda y por carga de página: el pie y cada precio
 * de la grilla leen lo mismo, y pedirlo por componente serían decenas de
 * pedidos iguales.
 */
const cache = new Map<string, Promise<StoreLegal | null>>();

function loadStoreLegal(tenantId: string): Promise<StoreLegal | null> {
  let p = cache.get(tenantId);
  if (!p) {
    p = clientJsonTenant<StoreLegal>('/api/v1/store/legal', tenantId);
    cache.set(tenantId, p);
    // Si falló, que el próximo componente pueda volver a intentar.
    p.then((v) => {
      if (!v) cache.delete(tenantId);
    });
  }
  return p;
}

/** Solo para los tests: cada uno arranca sin lo que dejó el anterior. */
export function resetStoreLegalCache() {
  cache.clear();
}

/** Los datos legales de la tienda, o null mientras no llegan (o si la API no respondió). */
export function useStoreLegal(tenantId: string | undefined): StoreLegal | null {
  const [legal, setLegal] = useState<StoreLegal | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    loadStoreLegal(tenantId).then((v) => {
      if (active) setLegal(v);
    });
    return () => {
      active = false;
    };
  }, [tenantId]);
  return legal;
}

/**
 * El precio sin impuestos nacionales (Ley 27.743), en centavos. Null si la
 * tienda no lo muestra o el divisor no tiene sentido.
 */
export function priceWithoutTaxes(legal: StoreLegal | null, finalMinor: number): number | null {
  const rule = legal?.priceWithoutTaxes;
  if (!rule?.show || !(rule.divisor >= 1) || !Number.isFinite(finalMinor)) return null;
  return Math.round(finalMinor / rule.divisor);
}
