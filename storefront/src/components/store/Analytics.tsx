'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { apiUrl as API, tenantHeaders } from '@/lib/api-client';

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
      // Fuente de la visita (utm_source de campañas/redes): first-touch por
      // sesión — llega en la primera URL y se recuerda el resto de la visita.
      const fromUrl = new URLSearchParams(window.location.search).get('utm_source');
      if (fromUrl) sessionStorage.setItem('tiendafy.utm', fromUrl);
      const utmSource = fromUrl ?? sessionStorage.getItem('tiendafy.utm');
      fetch(`${API}/api/v1/track`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({
          path: pathname,
          referrer: document.referrer || null,
          visitorId,
          sessionId,
          utmSource,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* sin tracking si el browser bloquea storage */
    }
  }, [pathname, tenantId]);

  return null;
}
