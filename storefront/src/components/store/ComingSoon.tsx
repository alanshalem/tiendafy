import type { ThemeConfig } from '@/lib/theme';

/** Página pública cuando la tienda está "en construcción" (toggle del editor). */
export function ComingSoon({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const { title, message } = theme.comingSoon;
  const primary = `rgb(${theme.colors.primary})`;
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{
        background: `rgb(${theme.colors.bg})`,
        color: `rgb(${theme.colors.text})`,
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Halo de color de marca */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: primary }}
      />

      <div className="relative z-10 max-w-lg">
        {theme.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.logo} alt={tenantName} className="mx-auto mb-8 max-h-16 w-auto object-contain" />
        ) : (
          <div className="mb-8 text-2xl font-bold tracking-tight">{tenantName}</div>
        )}

        <div
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
          style={{ background: `rgb(${theme.colors.primary} / 0.12)`, color: primary }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: primary }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: primary }} />
          </span>
          Próximamente
        </div>

        <h1 className="text-3xl font-bold sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
          {title}
        </h1>
        {message && <p className="mt-4 text-base opacity-70">{message}</p>}
      </div>
    </main>
  );
}
