import { BRAND } from '../lib/runtime';

/**
 * Isologo de la instalación (antes copiado en AdminLayout, Login y
 * SettingsLayout). La letra sale de la marca: con el nombre configurado, el
 * panel no puede seguir mostrando la inicial de otro producto.
 */
export function LogoMark({ className }: { className?: string }) {
  const initial = BRAND.trim().charAt(0).toUpperCase() || 'T';

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="15" fill="rgb(var(--color-primary))" />
      <text
        x="32"
        y="45"
        textAnchor="middle"
        fontFamily="-apple-system, system-ui, sans-serif"
        fontWeight="700"
        fontSize="38"
        fill="#fff"
      >
        {initial}
      </text>
    </svg>
  );
}
