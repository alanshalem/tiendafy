'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

function persistentId(key: string, storage: Storage): string {
  let value = storage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    storage.setItem(key, value);
  }
  return value;
}

/** Beacon de page-view anónimo. Manda una vista al backend en cada navegación. */
export function Analytics({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!tenantId) return;
    try {
      const visitorId = persistentId('tiendafy.vid', localStorage);
      const sessionId = persistentId('tiendafy.sid', sessionStorage);
      fetch(`${API}/api/v1/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ path: pathname, referrer: document.referrer || null, visitorId, sessionId }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* sin tracking si el browser bloquea storage */
    }
  }, [pathname, tenantId]);

  return null;
}
