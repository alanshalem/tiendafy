import type { ThemeConfig } from '@/lib/theme';
import { WhatsAppFab } from './WhatsAppFab';

/**
 * El botón flotante de WhatsApp con lo que configuró el comercio. En la vista
 * previa (`live`) aparece aunque falte el número: así se ve dónde va y cómo
 * queda mientras se completa el panel.
 */
export function StoreWhatsApp({
  theme,
  tenantName,
  live = false,
}: {
  theme: ThemeConfig;
  tenantName: string;
  live?: boolean;
}) {
  const wa = theme.whatsappButton;
  if (!wa?.enabled || !(wa.phone || live)) return null;
  return (
    <WhatsAppFab
      phone={wa.phone}
      message={wa.message}
      storeName={tenantName}
      logo={theme.logo}
      showPreview={wa.showPreview !== false}
      position={wa.position}
      label={wa.label}
    />
  );
}
