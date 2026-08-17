/** Isologo de Tiendafy (antes copiado en AdminLayout, Login y SettingsLayout). */
export function LogoMark({ className }: { className?: string }) {
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
        t
      </text>
    </svg>
  );
}
